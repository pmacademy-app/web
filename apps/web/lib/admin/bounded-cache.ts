import { unstable_cache } from 'next/cache'

/**
 * Clock tolerance for the age check below. Next ages an entry from the moment it was
 * stored and on its own clock; this is the slack allowed between that and `computedAt`
 * before an entry Next still calls fresh is treated as too old.
 */
export const ADMIN_CACHE_GRACE_MS = 5_000

/**
 * Version of every payload stored through `cacheWithMaxAge`, put in front of the cache key.
 * Next keys an entry on the cached function's source text plus `keyParts`, and the function
 * handed to `unstable_cache` below is the same wrapper at every call site, so changing a
 * payload's shape does not change its key. Bump this when a cached shape changes, so the
 * new build never reads an entry the previous one wrote.
 */
export const ADMIN_CACHE_VERSION = 'v1'

interface CachedEnvelope<T> {
  value: T
  computedAt: number
}

/**
 * `unstable_cache` with a hard upper bound on staleness and visible recompute failures.
 *
 * On its own, `unstable_cache` only keeps failures out of the cache while the cache is
 * cold. Once an entry exists and is older than `revalidate`, a request render gets the
 * old value back immediately while Next recomputes in the background and swallows a
 * rejection (next/dist/server/web/spec-extension/unstable-cache.js). So `revalidate` is
 * not an upper bound on age, and a failing recompute is hidden behind the last healthy
 * value for as long as it keeps failing.
 *
 * The function returned here closes both gaps:
 *   - When Next runs `compute` for this read (a cold miss, or the background recompute of
 *     a stale entry), the read waits for that run and returns its result, so a rejection
 *     reaches the caller's own failed/degraded handling. It is the same run Next stores
 *     on success, so a stale read costs one compute, not two.
 *   - The stored payload carries `computedAt`. If a value comes back older than
 *     `revalidate` + `ADMIN_CACHE_GRACE_MS` without a recompute having been started for
 *     this read (one is already pending in this request, or the envelope is unreadable),
 *     it is discarded and `compute` runs directly, uncached.
 *
 * A fresh hit never runs `compute`. A rejection is never stored, exactly as before. The
 * result is JSON round-tripped on a hit and returned as computed otherwise, so callers
 * keep reviving Dates. `options` is passed to `unstable_cache` unchanged, so tag expiry
 * (`revalidateAdminTag`) works as it did.
 *
 * `keyParts` must be globally unique: it is the whole identity of the entry (see
 * `ADMIN_CACHE_VERSION`), so two call sites passing the same parts share one entry.
 */
export function cacheWithMaxAge<T>(
  compute: () => Promise<T>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] }
): () => Promise<T> {
  return async () => {
    // Set when Next runs the cached function during this read.
    const started: { run?: Promise<CachedEnvelope<T>> } = {}
    const run = async (): Promise<CachedEnvelope<T>> => {
      const value = await compute()
      return { value, computedAt: Date.now() }
    }
    const cached = unstable_cache(
      () => {
        started.run = run()
        return started.run
      },
      [ADMIN_CACHE_VERSION, ...keyParts],
      options
    )

    const envelope = (await cached()) as CachedEnvelope<T> | undefined
    // Next called `compute` during this read: wait for it instead of trusting what it
    // handed back, which on a stale entry is the old value.
    if (started.run) return (await started.run).value

    const age = typeof envelope?.computedAt === 'number' ? Date.now() - envelope.computedAt : Infinity
    if (envelope && age <= options.revalidate * 1000 + ADMIN_CACHE_GRACE_MS) return envelope.value
    return compute()
  }
}
