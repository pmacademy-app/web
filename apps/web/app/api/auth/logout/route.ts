import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { clearSessionCookies, REFRESH_TOKEN_COOKIE } from '@/lib/auth/session-cookies'
import { revokeSession } from '@/lib/auth/revoke-session'

export const runtime = 'nodejs'

/**
 * POST /api/auth/logout
 *
 * Deliberately anonymous. Logging out must clear the session cookies even when the
 * caller's token is already invalid: requiring a resolvable learner here would
 * strand exactly the users who most need the cookies gone.
 *
 * L4: it used to call `signOut()` on a session-less client, which revoked nothing, so the
 * refresh token stayed valid for thirty days. It now revokes through the same helper as
 * `POST /api/auth/session`: the refresh-token cookie first, else a Bearer access token.
 * The web client signs out through `/api/auth/session`; this route stays for API callers.
 */
export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.logout',
    domain: 'auth',
    summary: 'Unhandled exception in /api/auth/logout',
  },
  async ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null

    const revocation = await revokeSession({
      refreshToken: request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
      accessToken: bearer || request.cookies.get('sb-access-token')?.value || null,
    })

    const response = NextResponse.json(
      { success: true, message: 'Logged out successfully.', revocation },
      { status: 200 }
    )

    // Clear HTTP-only session cookies
    clearSessionCookies(response)

    return response
  }
)
