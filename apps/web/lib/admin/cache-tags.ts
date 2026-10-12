import { revalidateTag } from 'next/cache'

/**
 * Next.js data-cache tags owned by the admin console. Every `unstable_cache` wrapper in
 * lib/admin tags its entries with one of these, and every invalidation goes through
 * `revalidateAdminTag` so the tag strings live in one place.
 */
export const ADMIN_CACHE_TAGS = {
  dashboard: 'admin-dashboard',
  analytics: 'admin-analytics',
  shell: 'admin-shell',
  automations: 'admin-automations',
} as const

export type AdminCacheTag = (typeof ADMIN_CACHE_TAGS)[keyof typeof ADMIN_CACHE_TAGS]

/** The tags an admin may revalidate on demand through POST /api/admin/cache/revalidate. */
export const REVALIDATABLE_ADMIN_TAGS: readonly AdminCacheTag[] = Object.freeze([
  ADMIN_CACHE_TAGS.dashboard,
  ADMIN_CACHE_TAGS.analytics,
  ADMIN_CACHE_TAGS.shell,
  ADMIN_CACHE_TAGS.automations,
])

/**
 * Expires every cache entry carrying `tag`. `{ expire: 0 }` rather than the `'max'`
 * stale-while-revalidate profile: the admin who just acted reloads straight away and must
 * see the new numbers, not one more stale render. Failures are swallowed: a cache that
 * could not be cleared ages out on its own `revalidate` window, and must never fail the
 * mutation that triggered it.
 */
export function revalidateAdminTag(tag: AdminCacheTag): void {
  try {
    revalidateTag(tag, { expire: 0 })
  } catch (err) {
    console.warn(`[admin-cache] revalidateTag(${tag}) failed:`, err)
  }
}

/** Clears the cached console-shell attention counts (sidebar badges, header status). */
export function revalidateAdminShell(): void {
  revalidateAdminTag(ADMIN_CACHE_TAGS.shell)
}
