import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { withRoute } from '@/lib/api/with-route'
import { logSystemError } from '@/lib/monitoring/logger'
import { log } from '@/lib/monitoring/log'
import { sessionForClient } from '@/lib/auth/client-type'
import { clearSessionCookies, setSessionCookies } from '@/lib/auth/session-cookies'

export const runtime = 'nodejs'

/**
 * POST /api/auth/refresh
 *
 * Anonymous by policy: the refresh token itself is the credential, and it is
 * verified against the provider below. No body schema is declared on purpose —
 * the token may arrive in the body *or* in the `sb-refresh-token` cookie, so a
 * schema would turn the legitimate cookie-only call into a 400.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.refresh',
    domain: 'auth',
    summary: 'Unhandled exception in /api/auth/refresh',
  },
  async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}))
      const bodyRefreshToken = body && typeof body.refresh_token === 'string' ? body.refresh_token.trim() : null
      const cookieRefreshToken = request.cookies.get('sb-refresh-token')?.value || null

      const refreshToken = bodyRefreshToken || cookieRefreshToken

      if (!refreshToken) {
        return NextResponse.json(
          { error: 'Refresh token is required.', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        return NextResponse.json(
          { error: 'Authentication service unavailable.', code: 'SERVER_ERROR' },
          { status: 500 }
        )
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false },
      })

      const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken })

      if (error || !data.session || !data.user) {
        const response = NextResponse.json(
          { error: 'Invalid or expired refresh token.', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
        // Invalidate stale session cookies on failed refresh
        clearSessionCookies(response)
        return response
      }

      // B13-A: §15 of the plan allows tokens in a refresh response body for a native
      // client — that is how a native client gets its rotated pair, since it has no
      // cookie jar. A browser gets the rotated cookies below and nothing readable.
      const response = NextResponse.json(
        {
          success: true,
          ...sessionForClient(request, data.session),
          user: {
            id: data.user.id,
            email: data.user.email,
          },
        },
        { status: 200 }
      )

      setSessionCookies(response, data.session)

      return response
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown refresh error'
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'token_refresh_failure',
        message: errorMsg,
        details: {
          stage: 'api_auth_refresh',
        },
      })

      log.exception('auth.refresh.failed', err)
      // Rethrown so the wrapper records the incident and returns the ADR-006
      // envelope with a correlating errorId. The route-specific telemetry above is
      // preserved.
      throw err
    }
  }
)
