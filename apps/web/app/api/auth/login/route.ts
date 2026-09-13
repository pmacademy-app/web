import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/with-route'
import { SettingsService } from '@/lib/admin/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { ensureUserProfile } from '@/lib/auth'
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'

export const runtime = 'nodejs'

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required.').email('Please enter a valid email address.').trim().toLowerCase(),
  password: z.string().min(1, 'Password is required.'),
})

// Login abuse controls:
// - IP dimension protects against brute-force password guessing from a single location
// - Email dimension prevents attackers from rotating IPs indefinitely against a single victim account
// - Fail-closed ensures an outage in rate-limiting infrastructure does not open an unmetered brute-force path
const IP_LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10, failClosed: true } // 10 attempts / 15 min / IP
const EMAIL_LOGIN_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5, failClosed: true } // 5 attempts / 15 min / email

function canonicalizeEmailForLogin(email: string): string {
  const [local, domain] = email.toLowerCase().split('@')
  if (!domain) return email.toLowerCase()
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.split('+')[0]}@${domain}`
  }
  return `${local}@${domain}`
}

/**
 * POST /api/auth/login
 *
 * Anonymous by policy — establishing the session is the point.
 *
 * The layered rate limiting stays in the handler rather than moving to the
 * wrapper's declarative rules: the refusal carries this route's own
 * `AUTH_RATE_LIMITED` code, which the login screen branches on, and the
 * non-enumerating single message across both the IP and email dimensions is the
 * I-03-B6 invariant.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.login',
    domain: 'auth',
    summary: 'Unexpected failure while signing a learner in',
    errorMessage: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
    errorCode: 'SERVER_ERROR',
    body: loginSchema,
  },
  async ({ request, body: parsedBody }) => {
    try {
      const { email, password } = parsedBody

      // Evaluate abuse throttling before interacting with GoTrue or DB
      const clientIp = getClientIpBucket(request)
      const canonicalEmail = canonicalizeEmailForLogin(email)

      const [ipLimit, emailLimit] = await Promise.all([
        evaluatePersistentRateLimit(`login_ip:${clientIp}`, IP_LOGIN_LIMIT),
        evaluatePersistentRateLimit(`login_email:${canonicalEmail}`, EMAIL_LOGIN_LIMIT),
      ])

      if (!ipLimit.success || !emailLimit.success) {
        const resetInMs = Math.max(ipLimit.resetInMs, emailLimit.resetInMs)
        // Generic non-enumerating message so attacker cannot distinguish whether IP or email hit limit
        return NextResponse.json(
          {
            success: false,
            error: 'Too many login attempts. Please wait a while before trying again.',
            code: 'AUTH_RATE_LIMITED',
            resetInMs,
          },
          { status: 429 }
        )
      }

      const isRequired = await SettingsService.isEmailVerificationRequired()
      const supabase = createServiceRoleClient()

      // 1. Attempt password authentication with Supabase GoTrue
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      // 2. Handle unconfirmed email scenario
      const isUnconfirmedError = Boolean(
        authError && (
          authError.message.toLowerCase().includes('email not confirmed') ||
          authError.message.toLowerCase().includes('email_not_confirmed') ||
          authError.code === 'email_not_confirmed'
        )
      )

      if (isUnconfirmedError) {
        if (!isRequired) {
          // GoTrue verified the password against bcrypt hash, but rejected because email_confirmed_at is null.
          // Since verification requirement is OFF, safely auto-confirm this authenticated user:
          const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
          const matchedUser = (usersList?.users || []).find((u) => u.email?.toLowerCase() === email)

          if (matchedUser) {
            await supabase.auth.admin.updateUserById(matchedUser.id, { email_confirm: true })

            // Re-attempt sign-in with verified credentials
            const retryResult = await supabase.auth.signInWithPassword({ email, password })
            authData = retryResult.data
            authError = retryResult.error
          }
        } else {
          // Verification requirement is ON -> user must verify their email
          return NextResponse.json(
            {
              success: false,
              error: 'Please verify your email address before logging in. Check your inbox for the confirmation link.',
              code: 'AUTH_EMAIL_NOT_CONFIRMED',
              requiresVerification: true,
              email,
            },
            { status: 403 }
          )
        }
      }

      if (authError || !authData?.session || !authData?.user) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid email or password. Please check your credentials and try again.',
            code: 'AUTH_INVALID_CREDENTIALS',
          },
          { status: 401 }
        )
      }

      // 3. Strict verification check when requirement is ON
      if (isRequired && !authData.user.email_confirmed_at) {
        return NextResponse.json(
          {
            success: false,
            error: 'Please verify your email address before logging in.',
            code: 'AUTH_EMAIL_NOT_CONFIRMED',
            requiresVerification: true,
            email,
          },
          { status: 403 }
        )
      }

      // 4. Ensure public.users profile exists
      await ensureUserProfile(supabase, authData.user)

      // 5. Attach secure HTTP-only cookies
      const response = NextResponse.json({
        success: true,
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
    } catch (err) {
      console.error('[api/auth/login] Error:', err)
      // Rethrown so the wrapper records the incident and returns the same envelope
      // this catch used to build by hand — safe copy plus an errorId, never
      // err.message on a public endpoint.
      throw err
    }
  }
)
