/**
 * Utility function to build canonical Supabase authentication callback URLs.
 */
export function buildAuthCallbackUrl(
  siteUrl: string,
  tokenHash: string,
  type: string,
  redirectTo?: string
): string {
  let nextPath = '/dashboard'

  if (redirectTo) {
    try {
      const parsed = new URL(redirectTo, siteUrl)
      // If redirect_to is already a full callback URL with token_hash, normalize host to siteUrl
      if (parsed.searchParams.has('token_hash')) {
        const canonical = new URL(parsed.pathname + parsed.search, siteUrl)
        return canonical.toString()
      }
      nextPath = parsed.searchParams.get('next') || parsed.pathname + parsed.search
    } catch {
      nextPath = redirectTo
    }
  } else {
    if (type === 'signup') nextPath = '/verified'
    if (type === 'recovery') nextPath = '/reset-password?mode=update'
    if (type === 'email_change') nextPath = '/email-verified'
    if (type === 'invite') nextPath = '/onboarding'
  }

  const callbackUrl = new URL('/api/auth/callback', siteUrl)
  if (tokenHash) {
    callbackUrl.searchParams.set('token_hash', tokenHash)
  }
  callbackUrl.searchParams.set('type', type)
  if (nextPath && nextPath !== '/dashboard') {
    callbackUrl.searchParams.set('next', nextPath)
  }
  return callbackUrl.toString()
}
