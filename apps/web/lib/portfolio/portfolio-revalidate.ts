import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'
import type { Database } from '@/lib/supabase'

/**
 * Purges the cached public portfolio pages of one learner (perf plan item 13).
 *
 * /p/[username] and /p/[username]/capstones/[moduleSlug] are ISR pages cached per path for an
 * hour, and a private or missing portfolio is cached as "unavailable" like any other render. So
 * every write that changes what those pages show must purge the exact paths, or a portfolio made
 * private would stay visible until the hour ran out.
 *
 * Literal paths, not a route pattern: the pages are served only under the trimmed lowercase
 * username (they redirect any other spelling), revalidatePath is case-sensitive, and there are
 * only a handful of capstone slugs. Best-effort: revalidatePath throws outside a request scope,
 * and a failed purge must never fail the write that triggered it.
 */

/** The one spelling of a username the public pages are served and cached under. */
function canonicalUsername(username: string): string {
  return username.trim().toLowerCase()
}

/** Every cached public path of a learner: the portfolio and one page per capstone slug. */
export function publicPortfolioPaths(
  username: string,
  moduleSlugs: readonly string[] = Object.keys(CAPSTONE_DEFINITIONS),
): string[] {
  const handle = canonicalUsername(username)
  if (!handle) return []
  return [`/p/${handle}`, ...moduleSlugs.map((slug) => `/p/${handle}/capstones/${slug}`)]
}

/** Purges a learner's public portfolio pages. A null or empty username is a no-op. */
export function revalidatePublicPortfolio(
  username: string | null | undefined,
  moduleSlugs?: readonly string[],
): void {
  if (!username) return
  for (const path of publicPortfolioPaths(username, moduleSlugs)) {
    try {
      revalidatePath(path)
    } catch {
      // Best-effort, see above.
    }
  }
}

/**
 * Looks the learner's username up by id, then purges their public pages. For write paths that
 * know only the user id. One primary-key read; never throws.
 */
export async function revalidatePublicPortfolioForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  moduleSlugs?: readonly string[],
): Promise<void> {
  try {
    const { data } = await supabase.from('users').select('username').eq('id', userId).maybeSingle()
    revalidatePublicPortfolio(data?.username ?? null, moduleSlugs)
  } catch {
    // Best-effort: the hourly revalidate is the backstop.
  }
}
