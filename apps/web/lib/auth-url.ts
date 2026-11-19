import { sanitizeNextPath } from '@/lib/auth/oauth-intent'

/** Where each email action lands when the caller did not ask for anything specific. */
function defaultNextPath(type: string): string {
  if (type === 'signup') return '/verified'
  if (type === 'recovery') return '/reset-password?mode=update'
  if (type === 'email_change') return '/email-verified'
  if (type === 'invite') return '/onboarding'
  return '/dashboard'
}

/** Query parameters that carry a credential and must never survive into `next`. */
const CREDENTIAL_PARAMS = ['token_hash', 'token', 'code', 'access_token', 'refresh_token']

/**
 * The same-origin relative path `redirect_to` asks to land on, or null.
 *
 * `redirect_to` is caller-influenced: it comes from whoever called `auth.signUp()`,
 * `auth.resend()` or `resetPasswordForEmail()`, constrained only by the project's
 * redirect allowlist. So only a path is taken from it, never a whole URL, and never
 * a credential parameter. When it points at our own callback (the usual shape,
 * `/api/auth/callback?next=/x`), its `next` is the path we want.
 */
function nextPathFromRedirect(redirectTo: string, siteUrl: string): string | null {
  let site: URL
  let parsed: URL
  try {
    site = new URL(siteUrl)
    parsed = new URL(redirectTo, site)
  } catch {
    return null
  }
  if (parsed.origin !== site.origin) return null

  let candidate: string
  if (parsed.pathname === '/api/auth/callback') {
    const next = parsed.searchParams.get('next')
    if (!next) return null
    candidate = next
  } else {
    for (const param of CREDENTIAL_PARAMS) parsed.searchParams.delete(param)
    candidate = parsed.pathname + parsed.search + parsed.hash
  }

  const safe = sanitizeNextPath(candidate, '')
  if (!safe) return null

  // `next` from a callback URL is a second, nested value: strip credentials from it
  // too, so `?next=/x?token_hash=evil` cannot smuggle one through.
  const nested = new URL(safe, site)
  for (const param of CREDENTIAL_PARAMS) nested.searchParams.delete(param)
  if (nested.origin !== site.origin) return null
  return nested.pathname + nested.search + nested.hash
}

/**
 * Builds the canonical Supabase email-action callback URL.
 *
 * The link is ALWAYS built from the genuine `tokenHash` and `type` GoTrue handed the
 * hook. It used to return `redirect_to` verbatim whenever that already contained a
 * `token_hash`, which let whoever chose `redirect_to` replace the victim's token with
 * their own: the victim clicks a real Prodily email and is signed in to the attacker's
 * account (login CSRF / session fixation). Only a same-origin `next` path is now taken
 * from `redirect_to`.
 */
export function buildAuthCallbackUrl(
  siteUrl: string,
  tokenHash: string,
  type: string,
  redirectTo?: string
): string {
  const requested = redirectTo ? nextPathFromRedirect(redirectTo, siteUrl) : null
  // A redirect to the bare site root carries no intent (it is GoTrue's default when
  // the caller passed nothing), so it keeps the action's own landing page.
  const nextPath = requested && requested !== '/' ? requested : defaultNextPath(type)

  const callbackUrl = new URL('/api/auth/callback', siteUrl)
  if (tokenHash) {
    callbackUrl.searchParams.set('token_hash', tokenHash)
  }
  callbackUrl.searchParams.set('type', type)
  if (nextPath !== '/dashboard') {
    callbackUrl.searchParams.set('next', nextPath)
  }
  return callbackUrl.toString()
}
