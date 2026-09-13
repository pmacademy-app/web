import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { createAuthenticatedServerClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * POST /api/auth/logout
 *
 * Deliberately anonymous. Logging out must clear the session cookies even when the
 * caller's token is already invalid — requiring a resolvable learner here would
 * strand exactly the users who most need the cookies gone. The route reads the
 * bearer token itself for best-effort provider revocation. See AUTHENTICATION.md
 * section 7a for the client-side counterpart.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.logout',
    domain: 'auth',
    summary: 'Unhandled exception in /api/auth/logout',
  },
  async ({ request }) => {
    const isProd = process.env.NODE_ENV === 'production'

    const authHeader = request.headers.get('Authorization')
    let accessToken: string | null = null
    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7).trim()
    }
    if (!accessToken) {
      accessToken = request.cookies.get('sb-access-token')?.value || null
    }

    // Best-effort server-side session revocation
    if (accessToken) {
      try {
        const authClient = createAuthenticatedServerClient(accessToken)
        await authClient.auth.signOut()
      } catch {
        // Non-fatal: even if provider sign out fails, cookies must still be cleared
      }
    }

    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully.' },
      { status: 200 }
    )

    // Clear HTTP-only session cookies
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
)
