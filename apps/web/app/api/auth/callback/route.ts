import { randomBytes } from 'node:crypto'
import {
  type EmailOtpType,
  type Session,
  type User,
  type UserIdentity,
  createClient,
} from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'
import {
  applyPendingReferral,
  createReferralAttribution,
  isPlausibleReferralCode,
} from '@/lib/referral/referral-service'
import { log } from '@/lib/monitoring/log'
import { setSessionCookies } from '@/lib/auth/session-cookies'
import { SettingsService } from '@/lib/admin/settings-service'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { buildConsentRecord } from '@/lib/legal/consent'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { clearOAuthCookies, readOAuthCookies } from '@/lib/auth/oauth-cookies'
import { createPkceExchangeClient } from '@/lib/auth/oauth-pkce'
import { getOAuthStateSecret, verifyOAuthIntent, type OAuthIntent } from '@/lib/auth/oauth-intent'
import {
  deleteFreshGoogleUserIfSafe,
  hasPasswordIdentity,
  type ServiceClient,
} from '@/lib/auth/oauth-account-guard'
import {
  AGGREGATE_SIGNUP_WINDOW_MS,
  SIGNUP_GLOBAL_LIMIT_KEY,
  aggregateSignupCeiling,
} from '@/lib/auth/signup-limits'

/**
 * Redeems a referral code that was recorded at signup and deliberately deferred.
 *
 * Never allowed to fail the verification itself: a learner confirming their address
 * must land in the app whatever the referral system says.
 */
async function redeemPendingReferral(
  supabase: Parameters<typeof applyPendingReferral>[0],
  user: Parameters<typeof applyPendingReferral>[1],
): Promise<void> {
  try {
    await applyPendingReferral(supabase, user)
  } catch (err) {
    log.warnException('auth.callback.referral_attribution_failed', err)
  }
}

/** Attach the Supabase session as HTTP-only cookies on a redirect response. */
function redirectWithSession(
  destination: URL,
  session: { access_token: string; refresh_token: string; expires_in: number },
): NextResponse {
  return setSessionCookies(NextResponse.redirect(destination), session)
}

// ── Google OAuth (PKCE) ─────────────────────────────────────────────────────
//
// The start route (`/api/auth/google`) leaves two cookies: the PKCE verifier and the
// signed intent. Every exit from the OAuth branches below clears both, success or
// not, so a verifier is never reusable and a stale intent never lingers.

/** Where the consent gate lives. The proxy keeps the learner there until they answer. */
const CONSENT_GATE_PATH = '/signup/complete-consent'

/** Same name the proxy writes (after cookie consent) and the signup route reads. */
const REFERRER_COOKIE = 'prodily_referrer'

type OAuthErrorCode =
  | 'oauth_cancelled'
  | 'oauth_failed'
  | 'oauth_admin_blocked'
  | 'signups_closed'
  | 'signup_limited'

function oauthErrorRedirect(origin: string, code: OAuthErrorCode): NextResponse {
  return clearOAuthCookies(NextResponse.redirect(new URL(`/login?error=${code}`, origin)))
}

/** The provider's error code, reduced to something safe to log. */
function safeErrorCode(raw: string): string {
  return raw.replace(/[^a-z0-9_]/gi, '').slice(0, 64) || 'unknown'
}

/**
 * Best-effort revocation of a session we minted but will not hand to the browser.
 * Never throws.
 *
 * `local` ends only this session, for an existing account whose other devices must
 * stay signed in. `global` is reserved for a refused brand-new account, which has no
 * other session worth keeping.
 */
async function revokeSession(admin: ServiceClient, session: Session, scope: 'local' | 'global'): Promise<void> {
  try {
    const { error } = await admin.auth.admin.signOut(session.access_token, scope)
    if (error) log.warn('auth.callback.oauth_revoke_failed', { scope, reason: safeErrorCode(error.code ?? error.name ?? 'error') })
  } catch (err) {
    log.warnException('auth.callback.oauth_revoke_failed', err, { scope })
  }
}

/**
 * The same two signup gates the email signup route applies, for an account Google
 * just created: the platform switch and the shared `signup_global` hourly ceiling.
 * Returns the refusal code, or null when the signup may proceed. Fails closed.
 */
async function newSignupRefusal(): Promise<'signups_closed' | 'signup_limited' | null> {
  const productSettings = await SettingsService.getProductSettings()
  if (!productSettings.allowSignups) return 'signups_closed'

  const dailyEmailLimit = await EmailAutomationsService.getState()
    .then((state) => state.dailyLimit)
    .catch(() => 100)

  const aggregateLimit = await evaluatePersistentRateLimit(SIGNUP_GLOBAL_LIMIT_KEY, {
    windowMs: AGGREGATE_SIGNUP_WINDOW_MS,
    limit: aggregateSignupCeiling(dailyEmailLimit),
    failClosed: true,
  })
  return aggregateLimit.success ? null : 'signup_limited'
}

/**
 * Refuses an account Google created moments ago: deletes it when the guard allows
 * (it should for a brand-new Google-only user), otherwise revokes the session so
 * nothing usable is left behind. Deletion goes only through the guard, and only
 * while the profile row is still missing: the guard re-reads it, so a parallel tab
 * that already created the profile is never deleted underneath it.
 */
async function refuseNewUser(
  admin: ServiceClient,
  user: User,
  session: Session,
  origin: string,
  code: OAuthErrorCode
): Promise<NextResponse> {
  const { deleted } = await deleteFreshGoogleUserIfSafe(admin, user, { profileMustBeMissing: true })
  if (!deleted) await revokeSession(admin, session, 'global')
  log.info('auth.callback.oauth_signup_refused', { reason: code, deleted })
  return oauthErrorRedirect(origin, code)
}

async function attributeReferral(
  admin: ServiceClient,
  request: NextRequest,
  intent: OAuthIntent,
  userId: string
): Promise<void> {
  const cookieRef = request.cookies.get(REFERRER_COOKIE)?.value
  const signedRef = isPlausibleReferralCode(intent.ref) ? intent.ref.trim() : null
  const ref = signedRef ?? (isPlausibleReferralCode(cookieRef) ? cookieRef.trim() : null)
  if (!ref) return
  try {
    await createReferralAttribution(admin, { referrerCodeOrId: ref, newUserId: userId })
  } catch (err) {
    log.warnException('auth.callback.oauth_referral_attribution_failed', err)
  }
}

// ── Pre-account takeover defence ────────────────────────────────────────────
//
// Email verification is off, so a password account may have been registered by
// someone who does not own the address. When the real owner later signs in with
// Google, Supabase links Google into that account and the squatter's password would
// keep working. The first sign-in after such a link therefore rotates the password to
// an unknowable value, ends every other session, and tells the owner.

/** A Google identity created this recently counts as "just linked". */
const GOOGLE_LINK_WINDOW_MS = 10 * 60 * 1000
/** The account must predate the Google identity by more than this to be a link, not a signup. */
const LINK_ACCOUNT_AGE_MARGIN_MS = 60 * 1000
const LINK_CLOCK_SKEW_MS = 60 * 1000

function hasUsablePassword(user: User): boolean {
  const passwordSet = (user.app_metadata as Record<string, unknown> | undefined)?.password_set
  // `password_set: false` means a password was removed (by this very defence, or
  // T4's settings flow); the leftover email identity no longer signs anyone in.
  if (passwordSet === false) return false
  if (passwordSet === true) return true
  return hasPasswordIdentity(user)
}

/**
 * The Google identity that was linked into a pre-existing password account within
 * the last ten minutes, or null. Null for Google-only accounts, brand-new accounts
 * and old links.
 */
function findFreshGoogleLink(user: User, now: number = Date.now()): UserIdentity | null {
  const google = (user.identities ?? [])
    .filter((identity) => identity?.provider === 'google' && identity.created_at)
    .sort((a, b) => Date.parse(b.created_at ?? '') - Date.parse(a.created_at ?? ''))[0]
  if (!google?.created_at) return null

  const linkedAt = Date.parse(google.created_at)
  if (!Number.isFinite(linkedAt)) return null
  if (now - linkedAt > GOOGLE_LINK_WINDOW_MS || linkedAt - now > LINK_CLOCK_SKEW_MS) return null

  if (!hasUsablePassword(user)) return null

  const accountCreatedAt = Date.parse(user.created_at)
  if (!Number.isFinite(accountCreatedAt)) return null
  if (linkedAt - accountCreatedAt <= LINK_ACCOUNT_AGE_MARGIN_MS) return null

  return google
}

const GOOGLE_LINKED_TITLE = 'Your account is now linked to Google'
const GOOGLE_LINKED_BODY =
  'Your Prodily account is now linked to Google. We signed you out on other devices and removed ' +
  'your old password. To log in with a password too, use Forgot password on the login page.'

/**
 * Runs the takeover defence for an existing account that just had Google linked in.
 * Never throws and never blocks the sign-in: every failed step is logged at error
 * level so it is visible, and the learner (who has just proved control of the Google
 * account for this address) still gets in.
 */
async function secureFreshGoogleLink(
  admin: ServiceClient,
  user: User,
  session: Session,
  googleIdentity: UserIdentity
): Promise<void> {
  const userId = user.id
  log.warn('security.auth.google_linked_into_password_account', { userId })

  // a) An unknowable password, and the flag the settings UI reads as "no password".
  try {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: randomBytes(48).toString('base64url'),
      app_metadata: { ...(user.app_metadata ?? {}), password_set: false },
    })
    if (error) {
      log.error('security.auth.google_link_password_rotate_failed', {
        userId,
        reason: safeErrorCode(error.code ?? error.name ?? 'error'),
      })
    }
  } catch (err) {
    log.exception('security.auth.google_link_password_rotate_failed', err, { userId })
  }

  // b) Every other session (the squatter's included) ends; this one survives.
  try {
    const { error } = await admin.auth.admin.signOut(session.access_token, 'others')
    if (error) {
      log.error('security.auth.google_link_signout_others_failed', {
        userId,
        reason: safeErrorCode(error.code ?? error.name ?? 'error'),
      })
    }
  } catch (err) {
    log.exception('security.auth.google_link_signout_others_failed', err, { userId })
  }

  // c) Tell the owner. In-app for now (no email template for this event exists yet);
  // critical priority so preferences cannot hide it, and keyed per identity so a
  // retried callback does not notify twice.
  try {
    const result = await createInAppNotification({
      userId,
      idempotencyKey: `google-linked-${userId}-${googleIdentity.identity_id ?? googleIdentity.id}`,
      category: 'security',
      title: GOOGLE_LINKED_TITLE,
      body: GOOGLE_LINKED_BODY,
      actionUrl: '/settings?tab=security',
      priority: 'critical',
    })
    if (!result.success) {
      log.error('security.auth.google_link_notify_failed', { userId, reason: result.reason ?? 'unknown' })
    }
  } catch (err) {
    log.exception('security.auth.google_link_notify_failed', err, { userId })
  }
}

/**
 * The authoritative auth user (identities and app_metadata) for the takeover check.
 * Falls back to the user from the exchange when the lookup fails, and says so.
 */
async function loadAuthUser(admin: ServiceClient, fallback: User): Promise<User> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(fallback.id)
    if (!error && data?.user) return data.user
    log.error('security.auth.google_link_user_lookup_failed', { userId: fallback.id })
  } catch (err) {
    log.exception('security.auth.google_link_user_lookup_failed', err, { userId: fallback.id })
  }
  return fallback
}

type ConsentState = { auth_provider: string; terms_accepted_at: string | null }

/**
 * The `?code` branch: Google sign-in returning through Supabase.
 *
 * Nothing is exchanged until both cookies check out: a missing verifier, a missing
 * or forged intent, or a missing signing secret all end at `oauth_failed`. New vs
 * existing is decided from `public.users` BEFORE `ensureUserProfile`, because that
 * call creates the row and would make every user look existing. Only a new user gets
 * the signed consent and a referral; an existing user (including a password account
 * Supabase linked to Google) keeps whatever consent and provider they already have.
 */
async function handleOAuthCode(request: NextRequest, origin: string, code: string): Promise<NextResponse> {
  const { verifier, intent: intentToken } = readOAuthCookies(request)
  const secret = getOAuthStateSecret()
  if (!secret || !verifier || !intentToken) {
    log.warn('auth.callback.oauth_state_missing', {
      secret: Boolean(secret),
      verifier: Boolean(verifier),
      intent: Boolean(intentToken),
    })
    return oauthErrorRedirect(origin, 'oauth_failed')
  }

  const intent = verifyOAuthIntent(intentToken, secret)
  if (!intent) {
    log.warn('auth.callback.oauth_intent_invalid')
    return oauthErrorRedirect(origin, 'oauth_failed')
  }

  try {
    const { data, error } = await createPkceExchangeClient(verifier).auth.exchangeCodeForSession(code)
    if (error || !data?.user || !data?.session) {
      log.error('auth.callback.oauth_exchange_failed', {
        reason: error ? safeErrorCode(error.code ?? error.name ?? 'error') : 'no_session',
      })
      return oauthErrorRedirect(origin, 'oauth_failed')
    }
    const { user, session } = data

    const admin = createServiceRoleClient()
    const { data: existing, error: lookupError } = await admin
      .from('users')
      .select('id, auth_provider, terms_accepted_at, is_admin')
      .eq('id', user.id)
      .maybeSingle()
    if (lookupError) {
      // Cannot tell new from existing, so cannot decide consent: refuse rather than guess.
      log.error('auth.callback.oauth_profile_lookup_failed', { userId: user.id })
      await revokeSession(admin, session, 'local')
      return oauthErrorRedirect(origin, 'oauth_failed')
    }

    if (existing?.is_admin === true) {
      // Admin accounts sign in with email and password only, so the admin guard's
      // assumptions about how an admin session was established keep holding.
      log.warn('security.auth.oauth_admin_blocked', { userId: user.id })
      await revokeSession(admin, session, 'local')
      return oauthErrorRedirect(origin, 'oauth_admin_blocked')
    }

    let consentState: ConsentState
    if (existing) {
      consentState = {
        auth_provider: existing.auth_provider,
        terms_accepted_at: existing.terms_accepted_at,
      }
      const authUser = await loadAuthUser(admin, user)
      const freshLink = findFreshGoogleLink(authUser)
      if (freshLink) await secureFreshGoogleLink(admin, authUser, session, freshLink)
    } else {
      let refusal: Awaited<ReturnType<typeof newSignupRefusal>>
      try {
        refusal = await newSignupRefusal()
      } catch (err) {
        log.exception('auth.callback.oauth_signup_gate_failed', err)
        return await refuseNewUser(admin, user, session, origin, 'oauth_failed')
      }
      if (refusal) return await refuseNewUser(admin, user, session, origin, refusal)

      // A Google-only account is recorded as such; an account that also has a
      // password identity keeps whatever ensureUserProfile derives (normally 'email').
      const provider = hasPasswordIdentity(user) ? undefined : 'google'
      // Consent is minted here, server-side, and only from a verified intent in which
      // the visitor ticked both boxes. Anything less leaves the columns NULL and the
      // learner goes through the consent gate.
      const consent = intent.terms && intent.age ? buildConsentRecord() : null
      // Without consent the welcome email waits for the gate's accept, so an account
      // that declines (and is deleted) never received one.
      const profile = await ensureUserProfile(admin, user, { provider, consent, skipWelcome: consent === null })
      if (!profile) {
        // No row means the gate cannot work (the proxy treats a missing row as not
        // gated), so do not hand out a session for an account in that state.
        log.error('auth.callback.oauth_profile_create_failed', { userId: user.id })
        await revokeSession(admin, session, 'global')
        return oauthErrorRedirect(origin, 'oauth_failed')
      }
      consentState = { auth_provider: profile.auth_provider, terms_accepted_at: profile.terms_accepted_at }

      await attributeReferral(admin, request, intent, user.id)
    }

    await redeemPendingReferral(admin, user)

    // intent.next is already sanitized by verifyOAuthIntent; the origin check is a
    // second, independent guard against an open redirect.
    let destination = new URL(intent.next, origin)
    if (destination.origin !== origin) destination = new URL('/dashboard', origin)
    if (consentState.auth_provider === 'google' && !consentState.terms_accepted_at) {
      const gate = new URL(CONSENT_GATE_PATH, origin)
      gate.searchParams.set('next', destination.pathname + destination.search + destination.hash)
      destination = gate
    }

    return clearOAuthCookies(redirectWithSession(destination, session))
  } catch (err) {
    log.exception('auth.callback.code_exchange_failed', err)
    return oauthErrorRedirect(origin, 'oauth_failed')
  }
}

/**
 * Supabase's Send Email Hook reports email-change events as the granular
 * `email_change_current` / `email_change_new` action types (one per address
 * being notified), but `verifyOtp()` only recognizes the single canonical
 * `email_change` OTP type. Normalizing here ensures a confirmation link is
 * never misrouted or rejected due to that sub-type mismatch.
 */
function normalizeOtpType(rawType: string | null): EmailOtpType | null {
  if (rawType === 'email_change_current' || rawType === 'email_change_new') {
    return 'email_change'
  }
  return rawType as EmailOtpType | null
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = normalizeOtpType(requestUrl.searchParams.get('type'))
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'
  let destination = new URL(next, requestUrl.origin)
  if (destination.origin !== requestUrl.origin) {
    destination = new URL('/dashboard', requestUrl.origin)
  }

  // ── Path 0: the provider sent the learner back with an error ─────────────
  //
  // Only the bare Google return carries this shape: its redirectTo has no query, so
  // a request with `type` or `next` is an email link and keeps the fallbacks below.
  const providerError = requestUrl.searchParams.get('error')
  if (providerError && !code && !token_hash && !type && !requestUrl.searchParams.has('next')) {
    log.warn('auth.callback.oauth_provider_error', { error: safeErrorCode(providerError) })
    return oauthErrorRedirect(
      requestUrl.origin,
      providerError === 'access_denied' ? 'oauth_cancelled' : 'oauth_failed'
    )
  }

  // ── Path 1: PKCE code exchange (Google OAuth) ─────────────────────────────
  //
  // Every link this app emails is a token_hash link (Path 2), so `?code` only comes
  // back from the Google flow. It always ends here; a failure never falls through.
  if (code && !token_hash) {
    return handleOAuthCode(request, requestUrl.origin, code)
  }

  // ── Path 2: Email OTP / token_hash (email confirmation, password reset) ──
  //
  // Supabase email verification links include ?token_hash=...&type=signup
  // (not a #hash fragment). The server reads the token_hash query param and
  // calls verifyOtp() to confirm the account and create a session.
  if (token_hash && type) {
    try {
      // Recovery OTP must use the anon client so Supabase creates a proper
      // user-scoped session. The service role client bypasses session creation
      // which breaks the password reset flow entirely.
      const authClient = type === 'recovery'
        ? createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
          )
        : createServiceRoleClient()
      const { data, error } = await authClient.auth.verifyOtp({ token_hash, type })

      if (!error && data.user) {
        // Recovery writes nothing to the database (the user already exists), so it
        // never gets a service-role database client.
        if (type !== 'recovery') {
          // SEC-07: verifyOtp leaves the learner's session on `authClient`, and
          // supabase-js then sends that access token on every later PostgREST call,
          // so writes through it would run as `authenticated`. Every database write
          // goes through this fresh service-role client instead, which never signs in.
          const admin = createServiceRoleClient()

          await ensureUserProfile(admin, data.user)
          // Verification is the registration milestone under Flow A, so this is where
          // a referral code supplied at signup is finally redeemed.
          await redeemPendingReferral(admin, data.user)

          // Supabase Auth's email_change confirmation updates `auth.users.email`
          // directly, but there is no trigger syncing that to `public.users.email`
          // (the app's own profile table). Keep them consistent here: this is the
          // one place every email-change confirmation flows through.
          if (type === 'email_change' && data.user.email) {
            try {
              await admin
                .from('users')
                .update({ email: data.user.email })
                .eq('id', data.user.id)
            } catch (syncErr) {
              log.exception('auth.callback.email_sync_failed', syncErr)
            }
          }
        }

        if (type === 'signup' || type === 'email_change') {
          try {
            const { globalNotificationDispatcher } = await import('@/lib/notifications/dispatcher')
            const { initializeNotificationConnectors } = await import('@/lib/notifications/events/connectors')
            initializeNotificationConnectors()
            await globalNotificationDispatcher.dispatch({
              id: `user-verified-${data.user.id}`,
              event: 'user.verified',
              userId: data.user.id,
              userEmail: data.user.email || '',
              userName: data.user.user_metadata?.full_name || data.user.user_metadata?.name || 'Learner',
              userTimezone: 'UTC',
              priority: 'high',
              category: 'security',
              occurredAt: new Date().toISOString(),
              payload: {
                email: data.user.email,
              },
            })
          } catch (notifErr) {
            log.warnException('auth.callback.verified_dispatch_failed', notifErr)
          }
        }

        // email_change confirmation always lands on the dedicated success page
        // (regardless of whether verifyOtp happened to mint a fresh session),
        // rather than continuing on to a generic post-login destination.
        if (type === 'email_change') {
          const successUrl = new URL('/email-verified', requestUrl.origin)
          return data.session ? redirectWithSession(successUrl, data.session) : NextResponse.redirect(successUrl)
        }

        if (data.session) {
          return redirectWithSession(destination, data.session)
        }

        return NextResponse.redirect(new URL('/login?verified=true', requestUrl.origin))
      }

      if (error) {
        log.error('auth.callback.verify_otp_rejected', { reason: error.message })
      }
    } catch (err) {
      log.exception('auth.callback.verify_otp_failed', err)
    }
  }

  // ── Fallback: both paths failed — send to appropriate destination with error ──
  if (type === 'recovery' || next.includes('reset-password')) {
    return NextResponse.redirect(new URL('/reset-password?error=expired', requestUrl.origin))
  }

  // Expired/invalid/already-used email-change confirmation: land on the same
  // dedicated page in its error state rather than bouncing to /login.
  if (type === 'email_change') {
    return NextResponse.redirect(new URL('/email-verified?status=error', requestUrl.origin))
  }

  // Distinguish email verification failures from generic auth failures
  // so the login page can show a targeted message and link to the resend flow.
  if (type === 'signup' || type === 'email') {
    return NextResponse.redirect(new URL('/login?error=verification_failed', requestUrl.origin))
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
}
