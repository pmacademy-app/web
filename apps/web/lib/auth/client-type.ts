/**
 * Which kind of client is calling (B13-A).
 *
 * ## Why this exists
 *
 * B13-A makes httpOnly cookies the only session store for the web. The refresh token
 * stopped being readable by browser JavaScript, which is the whole point — F-SEC-8 was
 * that `POST /api/auth/login` and `/signup` returned `session` (access *and* refresh
 * tokens) in the JSON body while also setting httpOnly cookies, making the cookie
 * protection decorative.
 *
 * But a native client has no cookie jar the server controls, and no browser origin. It
 * needs the tokens in the response body, and `docs/FINAL_IMPLEMENTATION_PLAN.md` §15
 * says so explicitly: token in a response body is "Never" for web, and "Only from login
 * and refresh" for mobile.
 *
 * So the decision cannot be "always omit" or "always include" — it has to key off the
 * caller. This module is that single decision point, rather than each auth route
 * inventing its own check.
 *
 * ## Why a header, and why this is not a security boundary
 *
 * A browser can send `X-Client-Type: native` just as easily as a real native client can.
 * That is fine, and it is important to be honest about why: this header decides what to
 * *echo back to a caller that has already authenticated as itself*. It grants nothing.
 * A browser that sets it receives its own tokens — tokens its own session already
 * carries — and nothing else changes. It cannot read another user's session, escalate,
 * or bypass a check.
 *
 * What it must never become is an input to authorization. `resolveActor()` owns that,
 * Bearer-first then cookie, and this value is never consulted there.
 *
 * The residual risk is an XSS on the web app calling login with this header to lift a
 * refresh token. That attack requires script execution, at which point the attacker can
 * already drive the authenticated session directly. The header does not widen it, and
 * the mitigation is the CSP and the XSS controls, not this flag.
 */

/** The header a non-browser client sets to identify itself. */
export const CLIENT_TYPE_HEADER = 'x-client-type'

/** The only value that opts a caller into tokens in the response body. */
export const NATIVE_CLIENT_TYPE = 'native'

/**
 * True when the caller declared itself a native client.
 *
 * Deliberately an exact, case-insensitive match on one value rather than a
 * "not a browser" heuristic. Sniffing the user agent would put a parser in the auth
 * path and would silently change behaviour whenever a user-agent string changed;
 * an explicit opt-in is a decision the client makes and a reviewer can see.
 */
export function isNativeClient(request: { headers: { get(name: string): string | null } }): boolean {
  const declared = request.headers.get(CLIENT_TYPE_HEADER)
  return typeof declared === 'string' && declared.trim().toLowerCase() === NATIVE_CLIENT_TYPE
}

/**
 * The session payload to place in an auth response body.
 *
 * Returns the session for a native caller and `undefined` for everyone else, so a route
 * can spread the result and let a browser response simply not have the key:
 *
 *     return NextResponse.json({ success: true, user, ...sessionForClient(request, session) })
 *
 * Spreading `undefined` adds nothing, so the browser body has no `session` field at all
 * rather than `session: null` — there is no token to find, not an empty one.
 */
export function sessionForClient<T>(
  request: { headers: { get(name: string): string | null } },
  session: T
): { session: T } | Record<string, never> {
  return isNativeClient(request) ? { session } : {}
}
