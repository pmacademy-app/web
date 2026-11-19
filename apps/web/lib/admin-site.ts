/**
 * Where the admin console lives.
 *
 * The admin console moved out of this repository into its own app on its own host.
 * `ADMIN_SITE_URL` is that host's base URL (for example `https://admin.example.com`).
 * The learner proxy uses it to send stale `/admin` bookmarks across with a 308, and the
 * error logger uses it for the "open the system page" link in admin alerts.
 *
 * Unset, empty, or not an http(s) URL means "no known admin host": callers then fall
 * back (the proxy lets `/admin` answer 404, the logger omits the absolute link).
 */
export function getAdminSiteUrl(): string | null {
  const raw = process.env.ADMIN_SITE_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/**
 * Absolute admin-host URL for an app-relative path such as `/admin/system`, or null when
 * `ADMIN_SITE_URL` is not configured. The path is appended as given (query included).
 */
export function adminSiteUrlFor(pathAndQuery: string): string | null {
  const base = getAdminSiteUrl()
  if (!base) return null
  return `${base}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`
}

/**
 * True for /admin and anything under it. The learner host serves none of it: the proxy
 * redirects these paths to ADMIN_SITE_URL or lets them 404. `/administrator` and similar
 * are not admin paths.
 */
export function isAdminConsolePath(path: string): boolean {
  return path === '/admin' || path.startsWith('/admin/')
}
