/**
 * Paths of the portfolio and capstone OG cards.
 *
 * Both card routes are cached per URL path (force-static), but the username lookup behind them
 * trims and ignores case (getPublicPortfolioData). Left alone, /api/og/portfolio/ALICE and
 * /api/og/portfolio/alice would be two cache entries for one learner, and revalidatePath (which is
 * case-sensitive) would only ever purge one of them. So there is one canonical path per learner,
 * the trimmed lowercase one: card URLs are built with it, purges target it, and the routes send
 * any other spelling to it instead of rendering.
 *
 * No imports, so pages and routes can both use it.
 */

/** The one spelling of a username a card is served and cached under. */
export function canonicalOgUsername(username: string): string {
  return username.trim().toLowerCase()
}

/** App path of a learner's portfolio card. */
export function portfolioOgCardPath(username: string): string {
  return `/api/og/portfolio/${encodeURIComponent(canonicalOgUsername(username))}`
}

/**
 * App path of one capstone card. The module slug is left as given: the route matches it exactly
 * (findPublicCapstone), so a slug in another case is a miss and never a second titled entry.
 */
export function capstoneOgCardPath(username: string, moduleSlug: string): string {
  return `${portfolioOgCardPath(username)}/capstones/${encodeURIComponent(moduleSlug)}`
}

/**
 * Whether a card route was reached under a non-canonical username and must redirect. Decided on
 * the string alone, before any lookup, so the answer says nothing about whether the learner
 * exists. A username that is empty once trimmed has no canonical path and falls through to the
 * route's ordinary miss.
 */
export function needsCanonicalOgRedirect(username: string): boolean {
  const canonical = canonicalOgUsername(username)
  return canonical.length > 0 && canonical !== username
}

/**
 * Redirect to a canonical card path. 301 because link-preview crawlers follow it and the mapping
 * never changes; it carries no learner data, so it is safe to cache for a long time. The Location
 * is a relative path built from a fixed prefix and encoded segments, so it cannot leave the site.
 */
export function redirectToOgCardPath(path: string): Response {
  return new Response(null, {
    status: 301,
    headers: { Location: path, 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
  })
}
