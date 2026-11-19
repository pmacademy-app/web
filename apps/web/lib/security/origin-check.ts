import { BRAND } from '@/lib/brand'

/**
 * Checks whether an incoming request to an API endpoint originated from the same site.
 * SEC-12: Enforces origin verification on non-GET, non-HEAD requests carrying session cookies.
 */

const EXEMPT_PATHS = [
  '/api/auth/send-email-hook',
  '/api/email/webhooks',
  '/api/email/unsubscribe',
]

export function isOriginExempt(pathname: string): boolean {
  if (pathname.startsWith('/api/cron/')) return true
  if (pathname === '/api/cron') return true
  return EXEMPT_PATHS.some((exempt) => pathname === exempt || pathname.startsWith(`${exempt}/`))
}

export function hasSessionCookie(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') || ''
  return (
    cookieHeader.includes('sb-access-token=') ||
    cookieHeader.includes('sb-refresh-token=') ||
    cookieHeader.includes('supabase-auth-token=')
  )
}

function getBaseOrigin(urlStr: string): string | null {
  try {
    return new URL(urlStr).origin.toLowerCase()
  } catch {
    return null
  }
}

export function isAllowedApiOrigin(request: Request, pathname: string): boolean {
  // Safe read-only HTTP methods do not mutate state
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return true
  }

  // Exempt server-to-server endpoints
  if (isOriginExempt(pathname)) {
    return true
  }

  // Only requests carrying cookie-based authentication are subject to CSRF origin checks
  if (!hasSessionCookie(request)) {
    return true
  }

  const secFetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  if (secFetchSite === 'cross-site') {
    return false
  }
  if (secFetchSite === 'same-origin') {
    return true
  }

  const brandOrigin = getBaseOrigin(BRAND.siteUrl)
  const requestUrlOrigin = getBaseOrigin(request.url)

  const originHeader = request.headers.get('origin')
  if (!originHeader) {
    const refererHeader = request.headers.get('referer')
    if (refererHeader) {
      const refererOrigin = getBaseOrigin(refererHeader)
      return Boolean(refererOrigin && (refererOrigin === brandOrigin || refererOrigin === requestUrlOrigin))
    }
    // L3: a cookie-bearing write with no Origin, no Referer and no Sec-Fetch-Site has
    // nothing to prove it came from this site, so it is refused. Every current browser
    // sends Origin on a non-GET fetch or form post; server-to-server callers carry no
    // session cookie (they authenticate by bearer token or signature) and the webhook,
    // hook and cron routes are exempt above.
    return Boolean(secFetchSite) && secFetchSite !== 'cross-site'
  }

  const candidateOrigin = getBaseOrigin(originHeader)
  if (!candidateOrigin) {
    return false
  }

  // Compare against canonical site URL
  if (brandOrigin && candidateOrigin === brandOrigin) {
    return true
  }

  // Compare against request URL origin
  if (requestUrlOrigin && candidateOrigin === requestUrlOrigin) {
    return true
  }

  // Compare against host header
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') || (request.url.startsWith('https') ? 'https' : 'http')
    const hostOrigin = `${proto}://${host}`.toLowerCase()
    if (candidateOrigin === hostOrigin) {
      return true
    }
  }

  return false
}
