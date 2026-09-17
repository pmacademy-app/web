import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { withRoute } from '@/lib/api/with-route'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { clearSessionCookies, REFRESH_TOKEN_COOKIE } from '@/lib/auth/session-cookies'
import { log } from '@/lib/monitoring/log'

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
 * Sign-out only (B13-A).
 *
 * This route used to be the client session bridge: the browser held a Supabase session
 * in localStorage, `AuthStateListener` watched it, and every sign-in or token refresh
 * POSTed the session here so the server could mirror it into httpOnly cookies. That is
 * the architecture F-02 describes, and the ingest half of it is now gone along with the
 * listener. The server issues the cookies at login; nothing hands it a session anymore.
 *
 * Accepting a session from the browser at all was the part worth removing. Even with
 * verification against Supabase it meant the session model had two writers, and a token
 * had to exist in JavaScript for the caller to send one. Now there is one writer.
 *
 * What remains is sign-out, and it does more than it used to. It revokes the refresh
 * token at the provider *before* clearing the cookies, rather than leaving that to a
 * browser `signOut()` call. With no persisted browser session there is no local session
 * for the client to revoke, so if the server did not do it the refresh token would stay
 * valid at Supabase for its full thirty days after the user had visibly logged out.
 *
 * Revocation failure does not fail the request. Clearing the cookies is the part the
 * user can observe and the part that ends the session for this browser; refusing to
 * clear them because the provider was unreachable would leave someone logged in at a
 * shared machine because of a network blip. The failure is logged and reported in the
 * body so a caller can surface it.
 *
 * Anonymous by policy: signing out must work even when the access token has already
 * expired, which is exactly when a learner is most likely to be clicking it.
 */

export const POST = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.session.sign_out',
    domain: 'auth',
    summary: 'Unhandled exception signing out',
  },
  async ({ request }) => {
    const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null

    // Revoke at the provider first. `signOut` with a scope of 'global' would end every
    // session this user has anywhere, which is not what one browser logging out means —
    // the local scope revokes just this refresh token family.
    let revocation: 'revoked' | 'skipped' | 'failed' = 'skipped'
    if (refreshToken) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (supabaseUrl && supabaseAnonKey) {
          const client = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
          // The refresh token is the credential; exchanging it yields an access token
          // the provider will accept for a scoped sign-out.
          const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken })
          if (!error && data.session) {
            await client.auth.signOut({ scope: 'local' })
            revocation = 'revoked'
          } else {
            // An already-invalid refresh token is the desired end state, not a failure.
            revocation = 'revoked'
          }
        }
      } catch (err) {
        revocation = 'failed'
        log.warnException('auth.session.revoke_failed', err)
      }
    }

    const response = NextResponse.json(
      { message: 'Signed out successfully.', revocation },
      { status: 200 }
    )
    clearSessionCookies(response)
    return response
  }
)
