import { revalidatePath } from 'next/cache'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'

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
    try {
      revalidatePath(`/api/og/portfolio/${username}/capstones/${slug}`)
    } catch {
      // revalidatePath is best-effort in some environments (e.g. outside a request).
    }
  }
}
