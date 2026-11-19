import type { NextResponse } from 'next/server'

/**
 * The session cookies, and the one place their names and options live (B13-A).
 *
 * B13-A makes these cookies the only session store for the web, which makes it worth
 * saying once what they are. The names and the `httpOnly`/`secure`/`sameSite`/`path`
 * quartet were previously repeated at seven call sites — `proxy.ts`, the login, signup,
 * refresh, callback, session and update-password routes — each free to drift. A session
 * model with one writer should not have seven copies of the writing.
 *
 * `sameSite: 'lax'` rather than `'strict'`: the email verification and password recovery
 * links are top-level cross-site navigations into `/api/auth/callback`, and `'strict'`
 * would withhold the cookie on exactly the request that has just set it, so the learner
 * would land on the dashboard logged out. `'lax'` sends cookies on top-level GET
 * navigations and withholds them from cross-site POSTs, which is the CSRF property that
 * matters here.
 *
 * `secure` follows `NODE_ENV` because local development is plain HTTP; a `Secure` cookie
 * would simply never be set there, and the resulting "login silently does nothing" is a
 * worse failure than an insecure cookie on localhost.
 */

export const ACCESS_TOKEN_COOKIE = 'sb-access-token'
export const REFRESH_TOKEN_COOKIE = 'sb-refresh-token'

/** One hour, matching Supabase's default access-token lifetime. */
export const DEFAULT_ACCESS_TOKEN_MAX_AGE = 3600

/** Thirty days. The refresh token is what survives a browser restart. */
export const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 30

/**
 * A readable "probably signed in" hint for the marketing pages (perf plan item 7).
 *
 * The session cookies are httpOnly and the marketing pages are ISR, so the navbar used to
 * ask `/api/auth/session` on every view. This cookie holds only `1`, never a token or an id,
 * so page JavaScript may read it. It is a hint, not a credential: nothing on the server
 * trusts it, and `useSessionCta` still confirms with the session route when it is present.
 * It lives as long as the refresh token, which is how long a session can last.
 */
export const SIGNED_IN_HINT_COOKIE = 'prodily_signed_in'

function hintOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

export interface SessionTokens {
  access_token: string
  refresh_token?: string | null
  expires_in?: number | null
}

function baseOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  }
}

/**
 * Writes the session cookies onto a response.
 *
 * The refresh token is optional because not every issuing path has one — a provider can
 * return an access token alone — and writing an empty string would clear a perfectly
 * good refresh token that is already set.
 */
export function setSessionCookies(response: NextResponse, session: SessionTokens): NextResponse {
  const maxAge =
    typeof session.expires_in === 'number' && session.expires_in > 0
      ? session.expires_in
      : DEFAULT_ACCESS_TOKEN_MAX_AGE

  response.cookies.set(ACCESS_TOKEN_COOKIE, session.access_token, {
    ...baseOptions(),
    maxAge,
  })

  if (session.refresh_token) {
    response.cookies.set(REFRESH_TOKEN_COOKIE, session.refresh_token, {
      ...baseOptions(),
      maxAge: REFRESH_TOKEN_MAX_AGE,
    })
  }

  response.cookies.set(SIGNED_IN_HINT_COOKIE, '1', { ...hintOptions(), maxAge: REFRESH_TOKEN_MAX_AGE })

  return response
}

/**
 * Clears both session cookies and the signed-in hint.
 *
 * Written with the same `httpOnly`/`secure`/`sameSite`/`path` as when they were set: a
 * browser only replaces a cookie when the name, domain and path match, so a clear that
 * omits `path: '/'` leaves the original in place and the user stays logged in.
 */
export function clearSessionCookies(response: NextResponse): NextResponse {
  for (const name of [ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE]) {
    response.cookies.set(name, '', { ...baseOptions(), maxAge: 0 })
  }
  response.cookies.set(SIGNED_IN_HINT_COOKIE, '', { ...hintOptions(), maxAge: 0 })
  return response
}
