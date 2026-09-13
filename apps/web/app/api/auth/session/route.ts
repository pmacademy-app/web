import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { logSystemError } from '@/lib/monitoring/logger'
import { createAuthenticatedServerClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'

/**
 * GET /api/auth/session
 *
 * Anonymous by policy: reporting "you are not signed in" is the useful answer for
 * an unauthenticated caller, so this must never 401. It resolves the user itself
 * and always returns 200.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.session.read',
    domain: 'auth',
    summary: 'Unhandled exception reading the auth session',
  },
  async ({ request }) => {
    try {
      const user = await getAuthenticatedUserFromRequest(request)
      if (!user) {
        return NextResponse.json({ authenticated: false, user: null }, { status: 200 })
      }
      return NextResponse.json(
        {
          authenticated: true,
          user: {
            id: user.id,
            email: user.email,
            full_name: (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || null,
          },
        },
        { status: 200 }
      )
    } catch {
      return NextResponse.json({ authenticated: false, user: null }, { status: 200 })
    }
  }
)

/**
 * POST /api/auth/session
 *
 * The client session bridge: either `{ action: 'sign_out' }` to clear the httpOnly
 * cookies, or a `{ session }` payload whose access token is verified against
 * Supabase Auth before any cookie is set. Anonymous by policy — establishing the
 * session is the whole point, so there is nothing to resolve beforehand.
 *
 * No body schema is declared: the two accepted payloads are a discriminated pair
 * validated in the handler, which already returns the canonical VALIDATION code.
 * B13-A owns the session model; this migration changes only the wrapper.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.session.sync',
    domain: 'auth',
    summary: 'Unhandled exception syncing the auth session',
  },
  async ({ request }) => {
    try {
      const body = await request.json().catch(() => null)
      if (!body || typeof body !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request body. JSON object expected.', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      const { session, action } = body

      if (action === 'sign_out') {
        const response = NextResponse.json(
          { message: 'Signed out successfully.' },
          { status: 200 }
        )
        const isProd = process.env.NODE_ENV === 'production'
        response.cookies.set('sb-access-token', '', {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: -1,
        })
        response.cookies.set('sb-refresh-token', '', {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: -1,
        })
        return response
      }

      if (!session || typeof session !== 'object') {
        return NextResponse.json(
          { error: 'Invalid request payload. Expected session or action.', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      const { access_token, refresh_token, expires_in } = session

      if (!access_token || typeof access_token !== 'string') {
        return NextResponse.json(
          { error: 'Invalid session payload. Access token required.', code: 'VALIDATION' },
          { status: 400 }
        )
      }

      // 1. Verify access token authenticity against Supabase Auth before setting cookies
      const authClient = createAuthenticatedServerClient(access_token)
      const { data: { user }, error: userError } = await authClient.auth.getUser()

      if (userError || !user) {
        return NextResponse.json(
          { error: 'Invalid or expired access token.', code: 'UNAUTHORIZED' },
          { status: 401 }
        )
      }

      let activeRefreshToken = refresh_token
      let activeExpiresIn = typeof expires_in === 'number' && expires_in > 0 ? expires_in : 3600

      // 2. Validate refresh token if provided to prevent session fixation / token mismatch
      if (refresh_token !== undefined && refresh_token !== null) {
        if (typeof refresh_token !== 'string' || !refresh_token.trim()) {
          return NextResponse.json(
            { error: 'Invalid refresh token format.', code: 'VALIDATION' },
            { status: 400 }
          )
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (supabaseUrl && supabaseAnonKey) {
          const { createClient } = await import('@supabase/supabase-js')
          const anonClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
          const { data: refreshData, error: refreshError } = await anonClient.auth.refreshSession({ refresh_token })
          if (refreshError || !refreshData.user || refreshData.user.id !== user.id) {
            return NextResponse.json(
              { error: 'Invalid or mismatched refresh token.', code: 'UNAUTHORIZED' },
              { status: 401 }
            )
          }
          if (refreshData.session) {
            activeRefreshToken = refreshData.session.refresh_token
            if (refreshData.session.expires_in) {
              activeExpiresIn = refreshData.session.expires_in
            }
          }
        }
      }

      const response = NextResponse.json(
        {
          message: 'Session updated successfully.',
          user: { id: user.id, email: user.email },
        },
        { status: 200 }
      )

      const isProd = process.env.NODE_ENV === 'production'
      response.cookies.set('sb-access-token', access_token, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: activeExpiresIn,
      })

      if (activeRefreshToken) {
        response.cookies.set('sb-refresh-token', activeRefreshToken, {
          httpOnly: true,
          secure: isProd,
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 30, // 30 days
        })
      }

      return response
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown session error'
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'session_cookie_sync_failure',
        message: errorMsg,
        details: {
          stage: 'api_auth_session',
          userAgent: request.headers.get('user-agent')?.slice(0, 100),
        },
      })

      console.error('[api/auth/session] Error setting session cookies:', error)
      // Rethrown so the wrapper records the incident and returns the ADR-006
      // envelope with a correlating errorId; the auth-specific telemetry above is
      // preserved.
      throw error
    }
  }
)
