/**
 * Build/boot-time configuration guard for Turnstile.
 *
 * `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is inlined into the client bundle at BUILD time. If
 * it is absent when the production bundle is compiled, the signup widget renders
 * nothing, no token is ever produced, and every registration is rejected by the
 * server's mandatory-token schema — a total signup outage with no operator signal,
 * because the "not configured" hint in `TurnstileWidget` is deliberately dev-only.
 *
 * A build that cannot produce a working signup page should fail loudly instead, so
 * this is asserted from `next.config.ts`.
 *
 * Deliberately NOT asserted here:
 *  - `TURNSTILE_SECRET_KEY`. It is read at request time, not build time, and must stay
 *    server-only; `lib/security/turnstile.ts` already fails closed in production when
 *    it is missing. Reading it here would risk pulling a server secret into build
 *    scope for no benefit.
 *  - A bare `TURNSTILE_SITE_KEY` fallback. There is exactly one public variable name;
 *    accepting a second would make it possible to configure a key that never reaches
 *    the browser.
 */

/** The only client-visible Turnstile variable. */
export const TURNSTILE_SITE_KEY_ENV = 'NEXT_PUBLIC_TURNSTILE_SITE_KEY'

export interface TurnstileBuildConfigResult {
  ok: boolean
  error?: string
}

/**
 * Pure check, so it can be unit-tested without mutating the real environment.
 *
 * Only a production build is enforced. Dev and test runs stay usable without a key:
 * the widget shows its dev-only hint, and the server still fails closed on the token.
 */
export function checkTurnstileBuildConfig(
  env: Record<string, string | undefined>
): TurnstileBuildConfigResult {
  if (env.NODE_ENV !== 'production') return { ok: true }

  const siteKey = env[TURNSTILE_SITE_KEY_ENV]
  if (typeof siteKey === 'string' && siteKey.trim()) return { ok: true }

  return {
    ok: false,
    error:
      `Missing required environment variable ${TURNSTILE_SITE_KEY_ENV}. ` +
      'It is inlined into the client bundle at build time, so a production build ' +
      'without it ships a signup page whose Turnstile widget never renders, making ' +
      'registration impossible. Set it in the production environment and rebuild. ' +
      '(The matching server-only secret, TURNSTILE_SECRET_KEY, must also be set at ' +
      'runtime — never with a NEXT_PUBLIC_ prefix.)',
  }
}

/** Throws when a production build is missing the public site key. */
export function assertTurnstileBuildConfig(
  env: Record<string, string | undefined> = process.env
): void {
  const result = checkTurnstileBuildConfig(env)
  if (!result.ok) {
    throw new Error(`[turnstile] ${result.error}`)
  }
}
