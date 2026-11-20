import { TESTIMONIALS_CACHE_TAG } from '@/lib/feedback/published-testimonials'
import { LEADERBOARD_CACHE_TAG } from '@/lib/leaderboard/leaderboard-db'

/**
 * What the admin console may invalidate on the learner host through
 * POST /api/internal/revalidate.
 *
 * The lists mirror what the console invalidated when it lived in this repository: the
 * learner-side cache tags and the learner pages its writes changed (user edits, fellow
 * grants, portfolio verification, capstone moderation, settings, testimonials). Anything
 * else is refused, so a leaked secret can only make learner caches rebuild, never reach
 * an admin path, another origin or a traversal.
 */

/**
 * `system_settings` is `SYSTEM_SETTINGS_TAG` (lib/settings/system-settings-service.ts),
 * restated here so this allowlist does not import the settings service and its
 * service-role client. A test pins the two to the same value.
 */
export const REVALIDATABLE_TAGS: readonly string[] = Object.freeze([
  'system_settings',
  LEADERBOARD_CACHE_TAG,
  TESTIMONIALS_CACHE_TAG,
])

/**
 * Section roots revalidated as layouts, which also covers every page beneath them
 * (`/progress/certificates`, `/capstones/<module>`, ...). The console revalidated these
 * with `'layout'` after a user change, and this keeps that reach.
 */
export const LAYOUT_PATHS: readonly string[] = Object.freeze(['/dashboard', '/academy', '/progress', '/capstones'])

const HANDLE = '[A-Za-z0-9_-]{1,64}'
const SLUG = '[a-z0-9-]{1,64}'
/** An OG segment as `encodeURIComponent` writes it: unreserved characters or %XX escapes. */
const ENCODED = '(?:[A-Za-z0-9_.~-]|%[0-9A-Fa-f]{2}){1,192}'

/**
 * Literal per-learner pages: the public portfolio and its capstone pages
 * (lib/portfolio/portfolio-revalidate.ts), with the username in stored case or lowercased. The
 * character classes leave no room for `.`, `:`, `\`, `?`, `#` or `%`.
 */
export const PAGE_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  new RegExp(`^/p/${HANDLE}$`),
  new RegExp(`^/p/${HANDLE}/capstones/${SLUG}$`),
])

/**
 * OG card routes (lib/og/revalidate-capstone-cards.ts). Their segments are URL-encoded,
 * so %XX escapes are accepted, but every segment must decode cleanly and the decoded
 * value must not be `.`/`..` or contain `/`, `\` or `:`.
 */
const OG_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  new RegExp(`^/api/og/portfolio/(${ENCODED})$`),
  new RegExp(`^/api/og/portfolio/(${ENCODED})/capstones/(${ENCODED})$`),
])

function isSafeEncodedSegment(segment: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(segment)
  } catch {
    return false
  }
  return decoded !== '.' && !decoded.includes('..') && !/[/\\:]/.test(decoded)
}

function isOgCardPath(path: string): boolean {
  for (const pattern of OG_PATH_PATTERNS) {
    const match = pattern.exec(path)
    if (match) return match.slice(1).every(isSafeEncodedSegment)
  }
  return false
}

export type RevalidatePathKind = 'layout' | 'page'

/** How to revalidate `path`, or null when it is not on the allowlist. */
export function classifyRevalidatePath(path: string): RevalidatePathKind | null {
  if (LAYOUT_PATHS.includes(path)) return 'layout'
  if (PAGE_PATH_PATTERNS.some((pattern) => pattern.test(path))) return 'page'
  if (isOgCardPath(path)) return 'page'
  return null
}

export function isRevalidatableTag(tag: string): boolean {
  return REVALIDATABLE_TAGS.includes(tag)
}
