/**
 * Decides whether a failed token refresh means the session is really gone.
 *
 * supabase-js returns network failures and auth-server 5xx responses as an `error`
 * (AuthRetryableFetchError, status 0 or 5xx), not as a throw. Treating every error as
 * "logged out" meant a short Supabase blip deleted every refresh cookie that was still
 * valid, logging users out for good. Only a 4xx from the auth server (invalid, revoked
 * or reused refresh token) is a definite failure; anything else is transient and the
 * cookies must be kept so the next request can try again.
 *
 * Pure: no Supabase import, safe in the proxy and in route handlers.
 */
export function isDefiniteRefreshFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { status, name } = error as { status?: unknown; name?: unknown }
  if (name === 'AuthRetryableFetchError') return false
  return typeof status === 'number' && status >= 400 && status < 500
}
