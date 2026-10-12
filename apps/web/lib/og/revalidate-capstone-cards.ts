import { revalidatePath } from 'next/cache'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import { capstoneOgCardPath, portfolioOgCardPath } from '@/lib/og/card-paths'

/**
 * Purges a card path. revalidatePath is case-sensitive, and the card routes only ever render under
 * the lowercase username (lib/og/card-paths.ts), so that path is the one that matters. The
 * stored-case path is purged as well when it differs, for entries cached before the routes
 * started redirecting.
 */
function purge(canonicalPath: string, storedCasePath: string): void {
  for (const path of new Set([canonicalPath, storedCasePath])) {
    try {
      revalidatePath(path)
    } catch {
      // revalidatePath is best-effort in some environments (e.g. outside a request).
    }
  }
}

/**
 * Drops cached capstone OG cards for a learner (Growth R5 B13b review fix).
 *
 * The capstone card route is cached (force-static, revalidate 3600). Without this, a card kept
 * showing a capstone's title and the learner's name after the portfolio went private or the
 * capstone was unpublished. Literal paths, not a route pattern: the route is a handler, and there
 * are only a handful of capstones. Best-effort, like the portfolio card's revalidation.
 */
export function revalidateCapstoneOgCards(
  username: string,
  moduleSlugs: readonly string[] = Object.keys(CAPSTONE_DEFINITIONS),
): void {
  for (const slug of moduleSlugs) {
    purge(capstoneOgCardPath(username, slug), `/api/og/portfolio/${username}/capstones/${slug}`)
  }
}

/** Drops a learner's cached portfolio OG card, on the same lowercase path the route serves. */
export function revalidatePortfolioOgCard(username: string): void {
  purge(portfolioOgCardPath(username), `/api/og/portfolio/${username}`)
}
