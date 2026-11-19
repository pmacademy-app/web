import { onTestFinished, vi } from 'vitest'

/**
 * A stand-in for Next's data cache behind `unstable_cache`, for tests that need a second call to
 * be served from the cache. The global setup mocks `unstable_cache` as a pass-through, which never
 * caches. This fake keys entries by the key parts, stores only resolved values (a rejection is not
 * stored, as in Next), round-trips them through JSON as the real data cache does, and drops every
 * entry carrying a tag on `revalidateTag`.
 *
 * Call it inside a test, before the module under test reads the cache. The `next/cache` mock
 * outlives `vi.resetModules()`, so the pass-through behaviour is put back when the test finishes.
 */
export async function installDataCacheFake(): Promise<{
  entries: Map<string, { value: string; tags: string[] }>
  calls: Array<{ keyParts: string[]; options: { tags?: string[]; revalidate?: number | false } }>
}> {
  const nextCache = await import('next/cache')
  const entries = new Map<string, { value: string; tags: string[] }>()
  const calls: Array<{ keyParts: string[]; options: { tags?: string[]; revalidate?: number | false } }> = []

  vi.mocked(nextCache.unstable_cache).mockImplementation(((
    fn: () => Promise<unknown>,
    keyParts: string[] = [],
    options: { tags?: string[]; revalidate?: number | false } = {}
  ) => {
    calls.push({ keyParts, options })
    return async () => {
      const key = JSON.stringify(keyParts)
      const hit = entries.get(key)
      if (hit) return JSON.parse(hit.value)
      const value = await fn()
      entries.set(key, { value: JSON.stringify(value), tags: options.tags ?? [] })
      return JSON.parse(JSON.stringify(value))
    }
  }) as never)

  vi.mocked(nextCache.revalidateTag).mockImplementation(((tag: string) => {
    for (const [key, entry] of entries) {
      if (entry.tags.includes(tag)) entries.delete(key)
    }
  }) as never)

  onTestFinished(() => {
    vi.mocked(nextCache.unstable_cache).mockImplementation(((fn: () => Promise<unknown>) => fn) as never)
    vi.mocked(nextCache.revalidateTag).mockImplementation((() => {}) as never)
  })

  return { entries, calls }
}
