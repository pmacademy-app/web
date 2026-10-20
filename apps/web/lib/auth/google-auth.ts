/**
 * Google sign-in helpers that are safe to import from client and server code.
 *
 * The flag is a NEXT_PUBLIC_ variable, so Next inlines it at build time. It must be
 * read with a literal `process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` access (no
 * destructuring, no dynamic key) or the client bundle sees `undefined` and the button
 * never renders. Changing the flag therefore needs a rebuild, not just a restart.
 */

/** Route that starts the Google OAuth flow (server side, sets the PKCE + intent cookies). */
export const GOOGLE_START_PATH = '/api/auth/google'

/** True only when the flag is exactly the string 'true'. Anything else is off. */
export function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === 'true'
}

export interface GoogleStartHrefOptions {
  /** The visitor ticked both the Terms/Privacy and the minimum-age boxes. */
  consent?: boolean
  /** Referral code to carry through the round trip. Omitted when empty. */
  ref?: string | null
  /** Same-origin path to land on afterwards. The server sanitizes it again. */
  next?: string | null
}

/**
 * Builds the start-route href. The query is only a hint: the start route signs it
 * into a short-lived cookie and the server re-validates `ref` and `next`, so nothing
 * here is trusted.
 */
export function buildGoogleStartHref(opts: GoogleStartHrefOptions = {}): string {
  const params = new URLSearchParams()
  if (opts.consent) {
    params.set('terms', '1')
    params.set('age', '1')
  }
  const ref = opts.ref?.trim()
  if (ref) params.set('ref', ref)
  const next = opts.next?.trim()
  if (next) params.set('next', next)

  const query = params.toString()
  return query ? `${GOOGLE_START_PATH}?${query}` : GOOGLE_START_PATH
}
