import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { withRoute } from '@/lib/api/with-route'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'
import { apiClassifiedAuthError, AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { isNetworkFailure } from '@/lib/auth/errors'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'

export const runtime = 'nodejs'

// Rate limiting for password update operations:
// - Authenticated sensitive operation
// - 10 attempts / 15 min / IP
// - 5 attempts / 15 min / user
const IP_UPDATE_PASSWORD_LIMIT = { windowMs: 15 * 60 * 1000, limit: 10, failClosed: true }
const USER_UPDATE_PASSWORD_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5, failClosed: true }

function resolveUserRateLimitKey(accessToken: string | null | undefined, refreshToken: string | null | undefined): string {
  if (accessToken) {
    try {
      const parts = accessToken.split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        if (typeof payload?.sub === 'string' && payload.sub.length > 0) {
          return `user:${payload.sub}`
        }
      }
    } catch {
      // Fall through to token hash
    }
  }
  const tokenToHash = accessToken || refreshToken || 'unknown'
  const hash = crypto.createHash('sha256').update(tokenToHash).digest('hex').slice(0, 32)
  return `token:${hash}`
}

/** Helper to delete recovery cookies cleanly across all response paths */
function clearRecoveryCookies(response: NextResponse): void {
  response.cookies.delete('sb-access-token')
  response.cookies.delete('sb-refresh-token')
  response.cookies.set('sb-access-token', '', { path: '/', maxAge: 0 })
  response.cookies.set('sb-refresh-token', '', { path: '/', maxAge: 0 })
}

/** Determines if an auth error is a confirmed, expected client token/session lifecycle state */
function isExpectedTokenInvalidation(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'object' && error !== null) {
    const err = error as { status?: unknown; code?: unknown; message?: string }
    const status = Number(err.status)
    const code = String(err.code || '').toLowerCase()
    const msg = String(err.message || '').toLowerCase()

    if (isNetworkFailure(msg) || isNetworkFailure(error)) {
      return false
    }

    if (
      code === 'session_not_found' ||
      code === 'token_expired' ||
      code === 'bad_jwt' ||
      code === 'invalid_grant' ||
      code === 'refresh_token_not_found' ||
      code === 'refresh_token_already_used' ||
      code === 'session_expired' ||
      code === 'user_not_found'
    ) {
      return true
    }

    if (
      msg.includes('refresh token is not valid') ||
      msg.includes('invalid refresh token') ||
      msg.includes('token is expired') ||
      msg.includes('jwt expired') ||
      msg.includes('invalid jwt') ||
      msg.includes('session not found') ||
      msg.includes('session expired') ||
      msg.includes('auth session missing') ||
      msg.includes('invalid_grant') ||
      msg.includes('refresh token not found') ||
      msg.includes('already used')
    ) {
      return true
    }

    if (status === 401 || (status === 400 && (msg.includes('grant') || msg.includes('token') || msg.includes('session')))) {
      return true
    }
  }
  return false
}

/**
 * POST /api/auth/update-password
 *
 * Anonymous by policy, and deliberately so: the caller authenticates with the
 * recovery session minted by the password-reset link, not with a normal learner
 * session, so `resolveActor` has nothing to resolve. The route verifies those
 * tokens itself and clears the recovery cookies on every exit path.
 *
 * The Content-Type check, the origin/referer check and the layered per-IP and
 * per-user limits stay in the handler: they run in a specific order and the
 * per-user limit is keyed on a claim inside the supplied token.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.update_password',
    domain: 'auth',
    summary: 'Unexpected failure while updating a password',
    errorMessage: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  },
  async ({ request }) => {
    try {
      const contentType = request.headers.get('content-type') || ''
      if (!contentType.includes('application/json')) {
        return NextResponse.json(
          { success: false, error: 'Unsupported Content-Type. Expected application/json' },
          { status: 415 }
        )
      }

      const origin = request.headers.get('origin') || ''
      const referer = request.headers.get('referer') || ''
      const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://prodily.adityagangwani.me').replace(/\/$/, '')
    
      let expectedHost = ''
      try {
        expectedHost = new URL(siteUrl).host
      } catch {
        expectedHost = 'prodily.adityagangwani.me'
      }

      const reqHost = request.headers.get('host') || ''

      if (origin) {
        try {
          const originHost = new URL(origin).host
          if (originHost !== reqHost && originHost !== expectedHost) {
            return NextResponse.json({ success: false, error: 'Forbidden: Untrusted Origin' }, { status: 403 })
          }
        } catch {
          return NextResponse.json({ success: false, error: 'Forbidden: Malformed Origin' }, { status: 403 })
        }
      } else if (referer) {
        try {
          const refererHost = new URL(referer).host
          if (refererHost !== reqHost && refererHost !== expectedHost) {
            return NextResponse.json({ success: false, error: 'Forbidden: Untrusted Referer' }, { status: 403 })
          }
        } catch {
          return NextResponse.json({ success: false, error: 'Forbidden: Malformed Referer' }, { status: 403 })
        }
      }

      let body: { newPassword?: unknown }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ success: false, error: 'Invalid JSON payload' }, { status: 400 })
      }

      const { newPassword } = body
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return NextResponse.json({ success: false, error: 'Password must be at least 6 characters.' }, { status: 400 })
      }

      const cookieStore = await cookies()
      const authHeader = request.headers.get('Authorization')
      const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null

      const accessToken = bearerToken || request.cookies.get('sb-access-token')?.value || cookieStore.get('sb-access-token')?.value
      const refreshToken = request.cookies.get('sb-refresh-token')?.value || cookieStore.get('sb-refresh-token')?.value

      // If neither token is present, recovery session is completely absent
      if (!accessToken && !refreshToken) {
        const response = NextResponse.json(
          { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
          { status: 401 }
        )
        clearRecoveryCookies(response)
        return response
      }

      // Evaluate atomic fail-closed rate limit for authenticated password update
      const clientIp = getClientIpBucket(request)
      const userKey = resolveUserRateLimitKey(accessToken, refreshToken)

      const [ipLimit, userLimit] = await Promise.all([
        evaluatePersistentRateLimit(`update_pwd_ip:${clientIp}`, IP_UPDATE_PASSWORD_LIMIT),
        evaluatePersistentRateLimit(`update_pwd_user:${userKey}`, USER_UPDATE_PASSWORD_LIMIT),
      ])

      if (!ipLimit.success || !userLimit.success) {
        const resetInMs = Math.max(ipLimit.resetInMs, userLimit.resetInMs)
        return NextResponse.json(
          {
            success: false,
            error: 'Too many password update attempts. Please wait a while before trying again.',
            code: 'AUTH_RATE_LIMITED',
            resetInMs,
          },
          { status: 429 }
        )
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      // 5. Attempt password update with the current access token.
      if (accessToken) {
        const userClient = createAuthenticatedServerClient(accessToken)
        const { error } = await userClient.auth.updateUser({ password: newPassword })

        if (!error) {
          const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
          clearRecoveryCookies(response)
          return response
        }

        const isExpiredOrInvalid = isExpectedTokenInvalidation(error)

        if (!isExpiredOrInvalid || !refreshToken) {
          if (!isExpiredOrInvalid) {
            // Genuine unexpected update failure
            void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: error.message })
          }
          // Classified rather than forwarded: the learner keeps an accurate,
          // actionable message without seeing raw GoTrue text. Status codes are
          // unchanged (401 expired/invalid link, 400 genuine failure).
          const response = apiClassifiedAuthError({
            cause: error,
            context: 'reset_password',
            status: isExpiredOrInvalid ? 401 : 400,
          })
          if (isExpiredOrInvalid) {
            clearRecoveryCookies(response)
          }
          return response
        }
        // Access token expired/invalid but refresh token is present — fall through to refresh fallback
      }

      // 6. Refresh-token fallback: exchange recovery refresh token for a fresh access token
      if (!refreshToken) {
        const response = NextResponse.json(
          { success: false, error: 'No active recovery session found. Please request a new password reset link.' },
          { status: 401 }
        )
        clearRecoveryCookies(response)
        return response
      }

      const refreshClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } })
      const { data: refreshData, error: refreshError } = await refreshClient.auth.refreshSession({
        refresh_token: refreshToken,
      })

      if (refreshError || !refreshData?.session) {
        const isExpected = isExpectedTokenInvalidation(refreshError)

        if (!isExpected) {
          // Log unexpected server/network failures during refresh so they remain observable
          void logSystemError({
            severity: 'error',
            category: 'auth',
            operation: 'update_password_refresh_failed',
            message: refreshError?.message || 'Refresh token exchange failed unexpectedly',
          })
        }

        const response = NextResponse.json(
          { success: false, error: 'Your password reset link has expired. Please request a new one.' },
          { status: 401 }
        )
        clearRecoveryCookies(response)
        return response
      }

      // 7. Retry with the freshly obtained access token
      const retryClient = createAuthenticatedServerClient(refreshData.session.access_token)
      const { error: retryError } = await retryClient.auth.updateUser({ password: newPassword })

      if (retryError) {
        const isExpected = isExpectedTokenInvalidation(retryError)
        if (!isExpected) {
          void logSystemError({ severity: 'warning', category: 'auth', operation: 'update_password_failure', message: retryError.message })
        }
        const response = NextResponse.json(
          { success: false, error: retryError.message || 'Failed to update password. Your reset link may have expired.' },
          { status: isExpected ? 401 : 400 }
        )
        if (isExpected) {
          clearRecoveryCookies(response)
        }
        return response
      }

      const response = NextResponse.json({ success: true, message: 'Password updated successfully.' })
      clearRecoveryCookies(response)
      return response
    } catch (err) {
      // Already safe before P7 (no raw message leaked). Rethrown so the wrapper
      // builds the same envelope — stable code, safe copy, correlatable errorId.
      throw err
    }
  }
)
