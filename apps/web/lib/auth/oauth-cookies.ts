import type { NextRequest, NextResponse } from 'next/server'

/**
 * The two short-lived cookies that carry a Google sign-in across the provider round
 * trip, and the one place their names and options live (next to session-cookies.ts).
 *
 * - `prodily_oauth_pkce` holds the PKCE code verifier that auth-js generated when the
 *   flow started. The callback needs it to exchange the code; nothing else may read it.
 * - `prodily_oauth_intent` holds the HMAC-signed intent (terms, age, referral, next)
 *   captured before the user left for Google. See oauth-intent.ts.
 *
 * Neither name starts with `sb-`: those belong to the session store (B13-A), and the
 * b13a test refuses any other writer of `sb-` cookies.
 *
 * `path: '/api/auth'` keeps both cookies off every page and API request except the
 * auth routes that need them. `sameSite: 'lax'` because the callback is a top-level
 * cross-site GET navigation back from Google; `'strict'` would withhold the cookies on
 * exactly that request. Ten minutes is ample for a consent screen.
 */

export const OAUTH_PKCE_COOKIE = 'prodily_oauth_pkce'
export const OAUTH_INTENT_COOKIE = 'prodily_oauth_intent'
export const OAUTH_COOKIE_PATH = '/api/auth'
export const OAUTH_COOKIE_MAX_AGE = 600

export interface OAuthCookieOptions {
  httpOnly: true
  secure: boolean
  sameSite: 'lax'
  path: '/api/auth'
  maxAge: number
}

export function oauthCookieOptions(): OAuthCookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_COOKIE_MAX_AGE,
  }
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

/**
 * The verifier as auth-js stores it is a JSON string, quotes included. Cookie values
 * cannot safely carry quotes, so it travels base64url-encoded.
 */
function encodeVerifier(verifier: string): string {
  return Buffer.from(verifier, 'utf8').toString('base64url')
}

function decodeVerifier(encoded: string | undefined): string | null {
  if (!encoded || !BASE64URL.test(encoded)) return null
  const decoded = Buffer.from(encoded, 'base64url')
  // Node's decoder is lenient; a value that does not re-encode to itself was not ours.
  if (decoded.toString('base64url') !== encoded) return null
  const text = decoded.toString('utf8')
  return text.length > 0 ? text : null
}

export function setOAuthCookies(
  response: NextResponse,
  values: { verifier: string; intent: string }
): NextResponse {
  const options = oauthCookieOptions()
  response.cookies.set(OAUTH_PKCE_COOKIE, encodeVerifier(values.verifier), options)
  response.cookies.set(OAUTH_INTENT_COOKIE, values.intent, options)
  return response
}

export function readOAuthCookies(request: NextRequest): { verifier: string | null; intent: string | null } {
  const verifier = decodeVerifier(request.cookies.get(OAUTH_PKCE_COOKIE)?.value)
  const intent = request.cookies.get(OAUTH_INTENT_COOKIE)?.value || null
  return { verifier, intent }
}

/**
 * Clears both cookies with the same options they were set with: a browser only
 * replaces a cookie when name, domain and path match, so a clear without
 * `path: '/api/auth'` would leave the original in place.
 */
export function clearOAuthCookies(response: NextResponse): NextResponse {
  const options = { ...oauthCookieOptions(), maxAge: 0 }
  response.cookies.set(OAUTH_PKCE_COOKIE, '', options)
  response.cookies.set(OAUTH_INTENT_COOKIE, '', options)
  return response
}
