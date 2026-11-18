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
 * The residual risk was an XSS on the web app calling login or refresh with this header
 * to lift a refresh token: an access token dies within the hour, a refresh token gives
 * the attacker a session that survives the XSS being fixed. So a request that carries
 * any browser signal never gets body tokens, whatever it declares (see
 * `hasBrowserSignals`). Script in a page cannot remove those signals: `Sec-Fetch-*`
 * and `Origin` are forbidden request headers, and same-origin fetches send cookies.
 *
 * No native client exists in this repository today. The mode is kept for the planned
 * mobile client (plan section 15); a native HTTP client sends none of these headers.
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
 * an explicit opt-in is a decision the client makes and a reviewer can see. The opt-in
 * can only be refused by browser signals, never granted by their absence alone.
 */
export function isNativeClient(request: { headers: { get(name: string): string | null } }): boolean {
  const declared = request.headers.get(CLIENT_TYPE_HEADER)
  if (typeof declared !== 'string' || declared.trim().toLowerCase() !== NATIVE_CLIENT_TYPE) return false
  return !hasBrowserSignals(request)
}

/** Session cookie names. A native client has no cookie jar the server writes to. */
const SESSION_COOKIE_PATTERN = /(?:^|;\s*)(?:sb-access-token|sb-refresh-token|supabase-auth-token)=/

/**
 * True when the request looks like it came from a browser: fetch metadata headers, an
 * `Origin` header, or this app's session cookies. Any one is enough to refuse body tokens.
 */
export function hasBrowserSignals(request: { headers: { get(name: string): string | null } }): boolean {
  const { headers } = request
  if (headers.get('sec-fetch-site') || headers.get('sec-fetch-mode') || headers.get('sec-fetch-dest')) return true
  if (headers.get('origin')) return true
  return SESSION_COOKIE_PATTERN.test(headers.get('cookie') || '')
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
