import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { AUTH_SERVICE_UNAVAILABLE_MESSAGE } from '@/lib/errors/api-response'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { getClientIpBucket } from '@/lib/security/client-ip'
import { log } from '@/lib/monitoring/log'
import { isPlausibleReferralCode } from '@/lib/referral/referral-service'
import { isGoogleAuthEnabled } from '@/lib/auth/google-auth'
import { setOAuthCookies } from '@/lib/auth/oauth-cookies'
import { createPkceCaptureClient } from '@/lib/auth/oauth-pkce'
import {
  getOAuthStateSecret,
  sanitizeNextPath,
  signOAuthIntent,
  type OAuthIntent,
} from '@/lib/auth/oauth-intent'

export const runtime = 'nodejs'

// Starting a flow costs nothing upstream (auth-js builds the provider URL locally),
// but each start mints cookies and, on return, may create an account. 20 per 15
// minutes per IP is far above a person retrying and well below a script.
const IP_START_LIMIT = { windowMs: 15 * 60 * 1000, limit: 20, failClosed: true }

/**
 * Whether `terms=1&age=1` may be believed: only when the navigation came from our own
 * page. Otherwise any third-party link could carry the parameters and mint a consent
 * the visitor never gave; such a visitor lands on the consent gate instead.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script. Where a
 * browser omits it, fall back to a same-origin Referer on the signup page.
 */
function consentCameFromOwnSignupPage(request: { headers: Headers; nextUrl: URL }): boolean {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite) return fetchSite === 'same-origin'

  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    const url = new URL(referer)
    return url.origin === request.nextUrl.origin && url.pathname === '/signup'
  } catch {
    return false
  }
}

function loginRedirect(origin: string, error: string): NextResponse {
  return NextResponse.redirect(new URL(`/login?error=${error}`, origin))
}

/**
 * GET /api/auth/google
 *
 * Browser navigation that starts Google sign-in. Anonymous by policy: the caller is
 * by definition not signed in yet (or is switching accounts).
 *
 * Every outcome is a redirect a person can read, never JSON: this route is reached
 * from an anchor, so a JSON 429 or 500 would leave the learner on a raw body. That is
 * why it declares no query schema and no wrapper rate limit (both answer in JSON) and
 * catches its own faults.
 *
 * The visitor's Terms/age consent, referral code and return path are signed into the
 * `prodily_oauth_intent` cookie; the PKCE verifier auth-js generated goes into
 * `prodily_oauth_pkce`. The callback refuses to create a session without both.
 */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous'] },
    operation: 'auth.google.start',
    domain: 'auth',
    summary: 'Unexpected failure while starting Google sign-in',
    errorMessage: AUTH_SERVICE_UNAVAILABLE_MESSAGE,
  },
  async ({ request }) => {
    const origin = request.nextUrl.origin

    if (!isGoogleAuthEnabled()) {
      return new NextResponse('Not Found', { status: 404 })
    }

    try {
      const limit = await evaluatePersistentRateLimit(
        `oauth_google_ip:${getClientIpBucket(request)}`,
        IP_START_LIMIT
      )
      if (!limit.success) {
        return loginRedirect(origin, 'oauth_rate_limited')
      }

      const secret = getOAuthStateSecret()
      if (!secret) {
        // Fail closed: without the secret the intent cannot be signed, and an unsigned
        // intent is one the callback must never trust.
        log.error('auth.google.state_secret_missing')
        return loginRedirect(origin, 'oauth_unavailable')
      }

      const params = request.nextUrl.searchParams
      const rawRef = params.get('ref')
      const consentTrusted = consentCameFromOwnSignupPage(request)
      const intent: OAuthIntent = {
        terms: consentTrusted && params.get('terms') === '1',
        age: consentTrusted && params.get('age') === '1',
        ref: isPlausibleReferralCode(rawRef) ? rawRef.trim() : null,
        next: sanitizeNextPath(params.get('next')),
        iat: Date.now(),
      }

      const { client, getCapturedVerifier } = createPkceCaptureClient()
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // No query string: the allowlist matches it, and everything the callback
          // needs travels in the signed cookie instead.
          redirectTo: new URL('/api/auth/callback', origin).toString(),
          skipBrowserRedirect: true,
          queryParams: { prompt: 'select_account' },
        },
      })

      const verifier = getCapturedVerifier()
      if (error || !data?.url || !verifier) {
        log.error('auth.google.start_failed', {
          reason: error ? 'provider_error' : !data?.url ? 'no_url' : 'no_verifier',
        })
        return loginRedirect(origin, 'oauth_failed')
      }

      const response = NextResponse.redirect(data.url, 302)
      return setOAuthCookies(response, { verifier, intent: signOAuthIntent(intent, secret) })
    } catch (err) {
      log.exception('auth.google.start_failed', err)
      return loginRedirect(origin, 'oauth_failed')
    }
  }
)
