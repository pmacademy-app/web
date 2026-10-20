import { NextResponse } from 'next/server'
import { z } from 'zod'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { requireUserId } from '@/lib/api/actor'
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { createServiceRoleClient } from '@/lib/supabase'
import { dispatchWelcomeEmailIfNeeded, ensureUserProfile } from '@/lib/auth'
import { buildConsentRecord } from '@/lib/legal/consent'
import { log } from '@/lib/monitoring/log'
import { ACCESS_TOKEN_COOKIE, clearSessionCookies } from '@/lib/auth/session-cookies'
import { deleteFreshGoogleUserIfSafe, hasPasswordIdentity } from '@/lib/auth/oauth-account-guard'
import { sanitizeNextPath } from '@/lib/auth/oauth-intent'

export const runtime = 'nodejs'

const completeConsentSchema = z.object({
  decision: z.enum(['accept', 'decline']),
  // Only a hint for where to land; sanitized below. Any client-sent timestamp or
  // document version is not part of the schema, so it cannot reach the database.
  next: z.string().max(2048).optional(),
})

const CONSENT_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10 }

/**
 * Same-origin check for a state-changing request that can delete an account.
 * SameSite=Lax already withholds the session cookie from cross-site POSTs; this also
 * refuses a same-site sibling origin. No Origin header (some same-origin fetches)
 * passes, as on update-password.
 */
function isTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const requestHost = request.headers.get('host') || new URL(request.url).host
  let siteHost = ''
  try {
    siteHost = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://prodily.app').host
  } catch {
    siteHost = 'prodily.app'
  }
  return originHost === requestHost || originHost === siteHost
}

/**
 * POST /api/auth/complete-consent
 *
 * The answer from the consent gate (`/signup/complete-consent`) that a Google
 * sign-up lands on when it arrived without Terms and age consent.
 *
 * - `accept` records consent server-side with `buildConsentRecord()`: timestamps and
 *   document versions are minted here, never taken from the client. It only fills
 *   consent that is still NULL, so an existing record is never overwritten.
 * - `decline` deletes the account only through `deleteFreshGoogleUserIfSafe` (Google
 *   only, created minutes ago, no learning activity); otherwise it signs the learner
 *   out. The session cookies are cleared either way.
 */
export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'auth.complete_consent',
    domain: 'auth',
    summary: 'Unexpected failure while recording sign-up consent',
    errorMessage: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
    body: completeConsentSchema,
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `auth_complete_consent:${actor.userId}` : null),
        ...CONSENT_LIMIT,
        failClosed: true,
      },
    ],
  },
  async ({ request, actor, body }) => {
    if (!isTrustedOrigin(request)) {
      throw new RouteError(403, 'FORBIDDEN', 'You do not have permission to perform this action.')
    }

    const userId = requireUserId(actor)
    const admin = createServiceRoleClient()

    if (body.decision === 'accept') {
      const consent = buildConsentRecord()
      const { data: updated, error: updateError } = await admin
        .from('users')
        .update(consent)
        .eq('id', userId)
        .is('terms_accepted_at', null)
        .select('id, auth_provider, name, timezone')
      if (updateError) throw new Error(`consent update failed: ${updateError.message}`)

      const updatedRow = updated?.[0]
      if (updatedRow?.auth_provider === 'google') {
        // The callback held the welcome email back for a Google sign-up without
        // consent; this is the moment it goes out. Same helper and idempotency key
        // (welcome-<id>) as every other path, and it never throws.
        const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
        if (!authError && authData?.user) {
          await dispatchWelcomeEmailIfNeeded(admin, authData.user, updatedRow.name, updatedRow.timezone ?? undefined)
        } else {
          log.warn('auth.consent.welcome_lookup_failed', { userId })
        }
      }

      if (!updatedRow) {
        // Either consent was already recorded (a double submit: nothing to do) or the
        // profile row does not exist yet. Only the second needs work, and creating the
        // row sends the welcome email itself.
        const { data: existing, error: lookupError } = await admin
          .from('users')
          .select('id')
          .eq('id', userId)
          .maybeSingle()
        if (lookupError) throw new Error(`profile lookup failed: ${lookupError.message}`)

        if (!existing) {
          const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
          if (authError || !authData?.user) throw new Error('auth user lookup failed')
          const authUser = authData.user
          const profile = await ensureUserProfile(admin, authUser, {
            provider: hasPasswordIdentity(authUser) ? undefined : 'google',
            consent,
          })
          if (!profile) throw new Error('profile creation failed')
        }
      }

      log.info('auth.consent.accepted', { userId })
      return NextResponse.json({ success: true, redirect: sanitizeNextPath(body.next) })
    }

    // decline
    // Nothing here may stop the cookies being cleared, so lookup faults are logged and
    // treated as "not deleted" rather than thrown.
    let deleted = false
    try {
      const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId)
      if (!authError && authData?.user) {
        // requireNullConsent: an account that has accepted (say, in another tab) is
        // never deleted by a stale decline.
        ;({ deleted } = await deleteFreshGoogleUserIfSafe(admin, authData.user, { requireNullConsent: true }))
      } else {
        log.warn('auth.consent.decline_lookup_failed', { userId })
      }
    } catch (err) {
      log.warnException('auth.consent.decline_lookup_failed', err, { userId })
    }

    // Best-effort revocation of this session only ('local'): a kept account's other
    // devices stay signed in. The cookies are cleared below whatever happens here.
    const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value
    if (accessToken && !deleted) {
      try {
        const { error: signOutError } = await admin.auth.admin.signOut(accessToken, 'local')
        if (signOutError) log.warn('auth.consent.decline_signout_failed', { userId })
      } catch (err) {
        log.warnException('auth.consent.decline_signout_failed', err, { userId })
      }
    }

    log.info('auth.consent.declined', { userId, deleted })
    const response = NextResponse.json({
      success: true,
      deleted,
      redirect: '/login?error=consent_declined',
    })
    return clearSessionCookies(response)
  }
)
