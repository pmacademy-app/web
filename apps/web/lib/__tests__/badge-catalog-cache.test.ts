/**
 * Perf plan item 11: the badge catalog is cached across requests (unstable_cache, tag
 * 'badges', a few hours of revalidate) and the learner's own user_badges read runs in
 * parallel with it instead of after it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'

vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: vi.fn() } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { unstable_cache } from 'next/cache'
import {
  BADGE_CATALOG_REVALIDATE_SECONDS,
  BADGE_CATALOG_TAG,
  getBadgeCatalog,
  getUserBadgesData,
} from '../badges-db'
import { BADGE_DEFINITIONS } from '@/config/badges'

type Row = Record<string, unknown>

/**
 * Fake whose `badges` read stays pending until released, so the test can see whether the
 * user_badges read was issued without waiting for it.
 */
function gatedFake(rows: Record<string, Row[]>, opts: { catalogError?: boolean } = {}) {
  const order: string[] = []
  let releaseCatalog: () => void = () => {}
  const catalogGate = new Promise<void>((resolve) => {
    releaseCatalog = resolve
  })
  const client = {
    from(table: string) {
      order.push(table)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) b[m] = () => b
      b.single = () => b
      b.maybeSingle = () => b
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        if (table === 'badges') {
          return catalogGate
            .then(() =>
              opts.catalogError ? { data: null, error: { message: 'badges down' } } : { data: rows.badges ?? [], error: null },
            )
            .then(resolve, reject)
        }
        return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject)
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, order, releaseCatalog }
}

const USER_ID = 'usr_badges'
const FIRST = BADGE_DEFINITIONS[0]
const SECOND = BADGE_DEFINITIONS[1]
const ROWS: Record<string, Row[]> = {
  badges: [
    { id: 'b-1', key: FIRST.key },
    { id: 'b-2', key: SECOND.key },
  ],
  user_badges: [{ badge_id: 'b-2', earned_at: '2026-11-01T00:00:00Z' }],
}
const PRELOADED = {
  user: { id: USER_ID, total_xp: 0, level: 1 } as unknown as Database['public']['Tables']['users']['Row'],
  progressRows: [],
  capstoneRows: [],
}

beforeEach(() => vi.mocked(unstable_cache).mockClear())

describe('getBadgeCatalog', () => {
  it('wraps the catalog read in unstable_cache with the badges tag and a revalidate of hours', async () => {
    const fake = gatedFake(ROWS)
    fake.releaseCatalog()
    await expect(getBadgeCatalog(fake.client)).resolves.toEqual(ROWS.badges)

    expect(unstable_cache).toHaveBeenCalledTimes(1)
    const [, keyParts, options] = vi.mocked(unstable_cache).mock.calls[0]
    expect(keyParts).toEqual(['badges-catalog', 'v1'])
    expect(options).toEqual({ tags: [BADGE_CATALOG_TAG], revalidate: BADGE_CATALOG_REVALIDATE_SECONDS })
    expect(BADGE_CATALOG_TAG).toBe('badges')
    expect(BADGE_CATALOG_REVALIDATE_SECONDS).toBeGreaterThanOrEqual(3600)
  })

  it('serves a cache hit without touching the database', async () => {
    vi.mocked(unstable_cache).mockImplementationOnce(() => async () => [{ id: 'cached', key: FIRST.key }])
    const fake = gatedFake(ROWS)
    await expect(getBadgeCatalog(fake.client)).resolves.toEqual([{ id: 'cached', key: FIRST.key }])
    expect(fake.order).toEqual([])
  })

  it('throws inside the cached function on a failed read (never cached) and degrades to empty', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = gatedFake(ROWS, { catalogError: true })
    fake.releaseCatalog()
    await expect(getBadgeCatalog(fake.client)).resolves.toEqual([])
    const cachedFn = vi.mocked(unstable_cache).mock.calls[0][0] as () => Promise<unknown>
    await expect(cachedFn()).rejects.toThrow('badges catalog read failed')
  })
})

describe('getUserBadgesData', () => {
  it('issues the user_badges read before the catalog read resolves', async () => {
    const fake = gatedFake(ROWS)
    const pending = getUserBadgesData(fake.client, USER_ID, PRELOADED)
    await vi.waitFor(() => expect(fake.order).toContain('user_badges'))
    expect(fake.order).toContain('badges')

    fake.releaseCatalog()
    const payload = await pending
    expect(payload.allBadges.find((b) => b.definition.key === SECOND.key)?.earnedAt).toBe('2026-11-01T00:00:00Z')
    expect(payload.allBadges.find((b) => b.definition.key === FIRST.key)?.earnedAt).toBeNull()
    expect(payload.recentBadge?.definition.key).toBe(SECOND.key)
    expect(payload.totalAvailable).toBe(BADGE_DEFINITIONS.length)
  })

  it('reads the catalog through the cache wrapper', async () => {
    const fake = gatedFake(ROWS)
    fake.releaseCatalog()
    await getUserBadgesData(fake.client, USER_ID, PRELOADED)
    expect(unstable_cache).toHaveBeenCalledTimes(1)
  })
})
