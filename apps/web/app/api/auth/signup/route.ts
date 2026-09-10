import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SettingsService } from '@/lib/admin/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'
import { createReferralAttribution, isPlausibleReferralCode } from '@/lib/referral/referral-service'
import { apiInternalError, apiClassifiedAuthError, AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'

export const runtime = 'nodejs'

const signupSchema = z.object({
  name: z.string().min(1, 'Full name is required.').min(2, 'Name must be at least 2 characters.').max(80).trim(),
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
  refCode: z.string().optional().nullable(),
})

// Signup abuse controls.
//
// 2026-09-06: unrestricted signup allowed ~1,200+ accounts in under 24h, each firing
// a welcome email and exhausting the Brevo quota. The per-IP and per-email limits
// below were the response.
//
// 2026-09-09: the same campaign returned and got through anyway. Both limits were
// keyed on values the attacker controls — the client-supplied `X-Forwarded-For` and
// the email address itself — so rotating either one bought a fresh budget. The three
// controls now applied are layered so that defeating one does not defeat the others:
//
//   per-IP        — trusted, platform-derived address; header spoofing no longer works
//   per-email     — canonicalized, so `+tag` aliases share one bucket
//   aggregate     — one platform-wide counter that NO rotation can escape
//
// All three fail closed: a limiter outage must not reopen the path that spends money.
const IP_SIGNUP_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5, failClosed: true } // 5 signups / 15 min / IP
const EMAIL_SIGNUP_LIMIT = { windowMs: 24 * 60 * 60 * 1000, limit: 3, failClosed: true } // 3 / 24h / canonical email

/**
 * Platform-wide signup ceiling per hour.
 *
 * This is the layer that stops a campaign rotating both IPs and addresses, because
 * the key is constant — rotation buys nothing. The threshold is derived from the
 * operator's own configured daily email allowance rather than invented: signups are
 * the dominant consumer of that allowance, so one hour's share of it is the honest
 * ceiling. The floor keeps a conservatively-configured limit from blocking a normal
 * day's organic signups (baseline before the incident was 1-49 signups/day).
 */
const AGGREGATE_SIGNUP_WINDOW_MS = 60 * 60 * 1000
const AGGREGATE_SIGNUP_FLOOR = 15

function aggregateSignupCeiling(dailyEmailLimit: number): number {
  const derived = Math.ceil((Number.isFinite(dailyEmailLimit) && dailyEmailLimit > 0 ? dailyEmailLimit : 100) / 24)
  return Math.max(AGGREGATE_SIGNUP_FLOOR, derived)
}

/**
 * Collapses `name+tag@gmail.com` / `name+tag@googlemail.com` down to `name@gmail.com`
 * so the "+" alias trick (used to mass-create accounts from one inbox) can't dodge
 * the per-email rate limit by generating unlimited unique-looking addresses.
 */
function canonicalizeEmailForRateLimit(email: string): string {
  const [local, domain] = email.toLowerCase().split('@')
  if (!domain) return email.toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0]}@${domain}`
  }
  return `${local}@${domain}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = signupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid registration data.', code: 'VALIDATION' },
        { status: 400 }
      )
    }

    const { name, email, password } = parsed.data
    const refCode = parsed.data.refCode || request.cookies.get('prodily_referrer')?.value || null

    // Check both platform behavior controls in a single DB call. This is the
    // coarsest, cheapest gate, so it runs first — while signups are closed
    // platform-wide, a request should be rejected immediately without also
    // consuming per-IP/per-email rate-limit budget for an attempt that was
    // never going to be allowed through anyway.
    const productSettings = await SettingsService.getProductSettings()

    // Backend enforcement of Allow Signups setting.
    // Do NOT rely only on hiding the signup form — the API must reject directly too.
    if (!productSettings.allowSignups) {
      return NextResponse.json(
        {
          error: 'New learner registrations are currently closed. Please check back later.',
          code: 'SIGNUPS_DISABLED',
        },
        { status: 403 }
      )
    }

    // Server-side abuse throttling — evaluated before any Supabase Auth call, because
    // `auth.signUp()` itself triggers an outbound verification email through the
    // GoTrue hook. Anything that gets past this point has already cost money.
    const clientIp = getClientIpBucket(request)
    const canonicalEmail = canonicalizeEmailForRateLimit(email)

    const dailyEmailLimit = await EmailAutomationsService.getState()
      .then((state) => state.dailyLimit)
      .catch(() => 100)

    const [ipLimit, emailLimit, aggregateLimit] = await Promise.all([
      evaluatePersistentRateLimit(`signup_ip:${clientIp}`, IP_SIGNUP_LIMIT),
      evaluatePersistentRateLimit(`signup_email:${canonicalEmail}`, EMAIL_SIGNUP_LIMIT),
      evaluatePersistentRateLimit('signup_global', {
        windowMs: AGGREGATE_SIGNUP_WINDOW_MS,
        limit: aggregateSignupCeiling(dailyEmailLimit),
        failClosed: true,
      }),
    ])

    if (!ipLimit.success || !emailLimit.success || !aggregateLimit.success) {
      const resetInMs = Math.max(ipLimit.resetInMs, emailLimit.resetInMs, aggregateLimit.resetInMs)
      // One undifferentiated message for all three. Telling a caller *which* limit
      // they hit would confirm whether the address is known to us and would let an
      // attacker measure the aggregate ceiling; the response contract is the same
      // 429 either way.
      return NextResponse.json(
        {
          error: 'Too many registration attempts. Please wait a while before trying again.',
          code: 'RATE_LIMITED',
          resetInMs,
        },
        { status: 429 }
      )
    }

    const isRequired = productSettings.requireEmailVerification
    const supabase = createServiceRoleClient()
    const origin = request.headers.get('origin') || request.nextUrl.origin || 'http://localhost:3000'

    // Attacker-controlled input: validate the shape before it is carried anywhere.
    // An unrecognizable code is dropped rather than persisted into auth metadata.
    const safeRefCode = isPlausibleReferralCode(refCode) ? refCode.trim() : null

    if (isRequired) {
      // ── Flow A: Verification required (ON) ──────────────────────────────────
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // The referral code rides along in auth metadata and is redeemed after
          // verification (see `applyPendingReferral`). It is deliberately NOT acted on
          // here: attribution needs a `public.users` row, creating that row dispatches
          // the welcome email, and doing so for an unverified account turned a request
          // field into an email-sending trigger.
          data: safeRefCode ? { full_name: name, pending_ref_code: safeRefCode } : { full_name: name },
          emailRedirectTo: `${origin}/api/auth/callback?next=/verified`,
        },
      })

      const isExistingAccount =
        Boolean(
          error && (
            error.message?.toLowerCase().includes('already registered') ||
            error.message?.toLowerCase().includes('already in use') ||
            error.message?.toLowerCase().includes('already exists')
          )
        ) ||
        Boolean(data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)

      if (isExistingAccount) {
        // Non-enumerating response: return the identical contract as a fresh registration.
        // Attacker cannot discern whether this email is already registered.
        // Legitimate users see the verification screen (which gives guidelines & login link).
        // CRITICAL: No profile creation, no attribution, and no welcome email is sent.
        return NextResponse.json({
          success: true,
          verificationRequired: true,
          email,
          message: 'Please check your email for the confirmation link.',
        })
      }

      if (error) {
        // Route the provider error through the existing classifier rather than
        // forwarding its message. The learner still gets the specific guidance
        // (weak password, rate limited) but never the raw Supabase/GoTrue text.
        return apiClassifiedAuthError({
          cause: error,
          context: 'signup',
          status: 400,
        })
      }

      // No profile creation and no attribution here. Under Flow A the account does
      // not exist as far as the application is concerned until the learner clicks the
      // verification link, and `/api/auth/callback` does both at that point.

      return NextResponse.json({
        success: true,
        verificationRequired: true,
        email,
        message: 'Please check your email for the confirmation link.',
      })
    } else {
      // ── Flow B: Verification NOT required (OFF) ─────────────────────────────
      // 1. Create confirmed user using Supabase Admin API
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      })

      if (createError) {
        const isExisting =
          createError.message?.toLowerCase().includes('already registered') ||
          createError.message?.toLowerCase().includes('already in use') ||
          createError.message?.toLowerCase().includes('already exists')

        if (isExisting) {
          // Non-enumerating response: direct user to login without revealing account existence or bypassing auth.
          return NextResponse.json({
            success: true,
            verificationRequired: false,
            redirect: '/login',
            message: 'Account created successfully. Please log in.',
          })
        }

        return NextResponse.json(
          {
            error: createError.message || 'Registration failed.',
            code: createError.code || 'SIGNUP_FAILED',
          },
          { status: 400 }
        )
      }

      const user = createData.user
      if (!user) {
        return NextResponse.json(
          { error: 'Failed to create user record.', code: 'SERVER_ERROR' },
          { status: 500 }
        )
      }

      // 2. Initialize public.users record and record referral attribution.
      //
      // Flow B is the branch where the operator has turned verification OFF, so
      // `admin.createUser({ email_confirm: true })` above already produced a
      // confirmed account. That IS the required registration milestone under this
      // configuration, so creating the profile (and with it the welcome email) here
      // is correct. Flow A's milestone is the verification click instead.
      await ensureUserProfile(supabase, user, { name })
      if (safeRefCode) {
        try {
          await createReferralAttribution(supabase, {
            referrerCodeOrId: safeRefCode,
            newUserId: user.id,
          })
        } catch (refErr) {
          console.warn('[signup] Referral attribution error in Flow B:', refErr)
        }
      }

      // 3. Generate genuine Supabase session via password login
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError || !authData?.session) {
        return NextResponse.json({
          success: true,
          verificationRequired: false,
          user,
          redirect: '/login',
          message: 'Account created successfully. Please log in.',
        })
      }

      // 4. Attach HTTP-only session cookies
      const response = NextResponse.json({
        success: true,
        verificationRequired: false,
        user: authData.user,
        session: authData.session,
        redirect: '/dashboard',
      })

      const isProd = process.env.NODE_ENV === 'production'
      response.cookies.set('sb-access-token', authData.session.access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: authData.session.expires_in || 3600,
      })
      response.cookies.set('sb-refresh-token', authData.session.refresh_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })

      return response
    }
  } catch (err) {
    console.error('[api/auth/signup] Error:', err)
    return apiInternalError({
      cause: err,
      domain: 'auth',
      operation: 'auth.signup',
      summary: 'Unexpected failure while registering a learner',
      code: 'SERVER_ERROR',
      message: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
    })
  }
}
