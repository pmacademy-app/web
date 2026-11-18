/**
 * Perf plan items 14 and 19: the weekly leaderboard and the admin settings are cached across
 * instances in Next's data cache (unstable_cache) under a tag, and writes invalidate the tag.
 *
 * Leaderboard: only the roster-wide board is cached, as JSON (no Sets or Maps); the viewer's own
 * entry and the opted-out viewer rule are computed per request from it. An opt-in change expires
 * the tag. Settings: runtime reads go through the tag cache, strict (admin) reads never do, and a
 * save revalidates `system_settings` with the two-argument form.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import { installDataCacheFake } from './helpers/data-cache-fake'

vi.mock('@/lib/monitoring/logger', () => ({ logErrorReport: vi.fn() }))

const dbMocks = vi.hoisted(() => ({
  selectRankedUsers: vi.fn(),
  selectOptedOutUserIds: vi.fn(),
  selectWeeklyLessonProgress: vi.fn(),
  selectWeeklyXpEvents: vi.fn(),
  selectLeaderboardSettings: vi.fn(),
  selectSingleRankedUser: vi.fn(),
  upsertLeaderboardOptIn: vi.fn(),
}))
vi.mock('@/lib/db/leaderboard', () => dbMocks)

const settingsDb = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
  reads: 0,
  failReads: false,
}))
vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, key: string) => ({
          maybeSingle: async () => {
            settingsDb.reads += 1
            if (settingsDb.failReads) return { data: null, error: { message: 'down' } }
            return { data: key in settingsDb.rows ? { value: settingsDb.rows[key] } : null, error: null }
          },
        }),
      }),
      upsert: async (row: { key: string; value: unknown }) => {
        settingsDb.rows[row.key] = row.value
        return { error: null }
      },
    }),
  }),
}))

const WEEK = '2026-11-16'
const supabase = {} as SupabaseClient<Database>

function seedBoard() {
  dbMocks.selectRankedUsers.mockResolvedValue([
    { id: 'a', username: 'ann', name: 'Ann', avatar_url: null, total_xp: 900, current_streak: 3, level: 4 },
    { id: 'b', username: 'ben', name: 'Ben', avatar_url: null, total_xp: 500, current_streak: 1, level: 3 },
    { id: 'c', username: 'cat', name: 'Cat', avatar_url: null, total_xp: 300, current_streak: 0, level: 2 },
  ])
  dbMocks.selectOptedOutUserIds.mockResolvedValue([{ user_id: 'c' }])
  dbMocks.selectWeeklyLessonProgress.mockResolvedValue([
    { user_id: 'a', status: 'completed', completed_at: `${WEEK}T10:00:00.000Z` },
    { user_id: 'b', status: 'completed', completed_at: `${WEEK}T10:00:00.000Z` },
  ])
  dbMocks.selectWeeklyXpEvents.mockResolvedValue([])
  dbMocks.selectLeaderboardSettings.mockImplementation(async (_db: unknown, userId: string) =>
    userId === 'c' ? { is_opted_in: false, allow_friend_requests: true } : null
  )
  dbMocks.selectSingleRankedUser.mockResolvedValue(null)
  dbMocks.upsertLeaderboardOptIn.mockResolvedValue({ error: null })
}

async function loadLeaderboard() {
  vi.resetModules()
  const mod = await import('../leaderboard-db')
  const fake = await installDataCacheFake()
  const nextCache = await import('next/cache')
  return { ...mod, fake, nextCache }
}

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset()
  seedBoard()
  settingsDb.rows = {}
  settingsDb.reads = 0
  settingsDb.failReads = false
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('weekly leaderboard: cross-instance cache', () => {
  it('caches the board with unstable_cache under the leaderboard tag for 300 seconds', async () => {
    const { getWeeklyLeaderboard, fake } = await loadLeaderboard()

    await getWeeklyLeaderboard(supabase, 'a', WEEK)

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].keyParts).toEqual(['leaderboard-weekly', 'v1', WEEK])
    expect(fake.calls[0].options).toEqual({ tags: ['leaderboard'], revalidate: 300 })
  })

  it('stores only JSON-safe data: the opt-out list is an array and no viewer data is inside', async () => {
    const { getWeeklyLeaderboard, fake } = await loadLeaderboard()

    await getWeeklyLeaderboard(supabase, 'a', WEEK)

    const [entry] = [...fake.entries.values()]
    const stored = JSON.parse(entry.value)
    expect(Object.keys(stored).sort()).toEqual(['optedOutUserIds', 'rawMetrics'])
    expect(stored.optedOutUserIds).toEqual(['c'])
    expect(entry.value).not.toContain('isCurrentUser')
    expect(entry.value).not.toContain('personalEntry')
  })

  it('computes each viewer entry outside the cache, from one shared board', async () => {
    const { getWeeklyLeaderboard } = await loadLeaderboard()

    const ann = await getWeeklyLeaderboard(supabase, 'a', WEEK)
    const ben = await getWeeklyLeaderboard(supabase, 'b', WEEK)

    // One aggregation for both viewers.
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(ann.personalEntry?.userId).toBe('a')
    expect(ben.personalEntry?.userId).toBe('b')
    expect(ann.entries.find((e) => e.isCurrentUser)?.userId).toBe('a')
    expect(ben.entries.find((e) => e.isCurrentUser)?.userId).toBe('b')
  })

  it('keeps the opted-out rules per viewer on a cached board', async () => {
    const { getWeeklyLeaderboard } = await loadLeaderboard()

    const ann = await getWeeklyLeaderboard(supabase, 'a', WEEK)
    const cat = await getWeeklyLeaderboard(supabase, 'c', WEEK)

    // Others never see an opted-out learner; the learner still sees their own entry.
    expect(ann.entries.some((e) => e.userId === 'c')).toBe(false)
    expect(cat.isOptedIn).toBe(false)
    expect(cat.entries.some((e) => e.userId === 'c' && e.isCurrentUser)).toBe(true)
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
  })

  it('never stores a degraded board, so the next request rebuilds and recovers', async () => {
    dbMocks.selectWeeklyXpEvents.mockRejectedValueOnce(new Error('xp down'))
    const { getWeeklyLeaderboard, fake } = await loadLeaderboard()

    const degraded = await getWeeklyLeaderboard(supabase, 'a', WEEK)
    expect(degraded.degraded).toBe(true)
    expect(fake.entries.size).toBe(0)

    const recovered = await getWeeklyLeaderboard(supabase, 'a', WEEK)
    expect(recovered.degraded).toBeUndefined()
    expect(fake.entries.size).toBe(1)
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(2)
  })

  it('builds directly when the data cache is unavailable outside a request', async () => {
    const { getWeeklyLeaderboard, nextCache } = await loadLeaderboard()
    vi.mocked(nextCache.unstable_cache).mockImplementation((() => async () => {
      throw new Error('Invariant: incrementalCache missing in unstable_cache')
    }) as never)

    const payload = await getWeeklyLeaderboard(supabase, 'a', WEEK)

    expect(payload.personalEntry?.userId).toBe('a')
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
  })
})

describe('weekly leaderboard: invalidation', () => {
  it('an opt-in change expires the tag at once, so the next board is rebuilt', async () => {
    const { getWeeklyLeaderboard, toggleLeaderboardOptIn, fake, nextCache } = await loadLeaderboard()
    await getWeeklyLeaderboard(supabase, 'a', WEEK)
    expect(fake.entries.size).toBe(1)

    await toggleLeaderboardOptIn(supabase, 'b', false)

    expect(nextCache.revalidateTag).toHaveBeenCalledWith('leaderboard', { expire: 0 })
    expect(fake.entries.size).toBe(0)
    dbMocks.selectOptedOutUserIds.mockResolvedValue([{ user_id: 'b' }, { user_id: 'c' }])
    const after = await getWeeklyLeaderboard(supabase, 'a', WEEK)
    expect(after.entries.some((e) => e.userId === 'b')).toBe(false)
  })

  it('a failed opt-in write invalidates nothing', async () => {
    dbMocks.upsertLeaderboardOptIn.mockResolvedValue({ error: new Error('write failed') })
    const { toggleLeaderboardOptIn, nextCache } = await loadLeaderboard()

    await expect(toggleLeaderboardOptIn(supabase, 'b', false)).rejects.toThrow('write failed')
    expect(nextCache.revalidateTag).not.toHaveBeenCalled()
  })

  it('a failed revalidateTag never fails the write', async () => {
    const { toggleLeaderboardOptIn, nextCache } = await loadLeaderboard()
    vi.mocked(nextCache.revalidateTag).mockImplementation(() => {
      throw new Error('outside a request')
    })

    await expect(toggleLeaderboardOptIn(supabase, 'b', true)).resolves.toEqual({ success: true, isOptedIn: true })
  })
})

describe('admin settings: tag cache', () => {
  async function loadSettings() {
    vi.resetModules()
    const mod = await import('../admin/settings-service')
    const fake = await installDataCacheFake()
    const nextCache = await import('next/cache')
    mod.SettingsService.invalidateCache()
    vi.mocked(nextCache.revalidateTag).mockClear()
    fake.calls.length = 0
    return { ...mod, fake, nextCache }
  }

  it('reads runtime settings through unstable_cache tagged system_settings for 60 seconds', async () => {
    settingsDb.rows.product_settings = { maintenanceMode: true }
    const { SettingsService, fake } = await loadSettings()

    const product = await SettingsService.getProductSettings()

    expect(product.maintenanceMode).toBe(true)
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].keyParts).toEqual(['system-settings', 'v1', 'product'])
    expect(fake.calls[0].options).toEqual({ tags: ['system_settings'], revalidate: 60 })
  })

  it('strict (admin) reads skip every cache and read the database', async () => {
    settingsDb.rows.product_settings = { maintenanceMode: false }
    const { SettingsService, fake } = await loadSettings()
    await SettingsService.getProductSettings()
    const readsAfterRuntime = settingsDb.reads

    settingsDb.rows.product_settings = { maintenanceMode: true }
    const strict = await SettingsService.getProductSettings({ strict: true })

    expect(strict.maintenanceMode).toBe(true)
    expect(settingsDb.reads).toBe(readsAfterRuntime + 1)
    expect(fake.calls).toHaveLength(1)
  })

  it('a save revalidates system_settings with the two-argument form and reaches the next read', async () => {
    const { SettingsService, nextCache } = await loadSettings()
    expect((await SettingsService.getProductSettings()).maintenanceMode).toBe(false)

    await SettingsService.updateProductSettings({ maintenanceMode: true })

    expect(nextCache.revalidateTag).toHaveBeenCalledWith('system_settings', 'max')
    expect(vi.mocked(nextCache.revalidateTag).mock.calls.every((args) => args.length === 2)).toBe(true)
    expect((await SettingsService.getProductSettings()).maintenanceMode).toBe(true)
  })

  it('a failed runtime read answers the defaults and caches nothing', async () => {
    settingsDb.failReads = true
    const { SettingsService, fake } = await loadSettings()

    const product = await SettingsService.getProductSettings()
    expect(product.maintenanceMode).toBe(false)
    expect(fake.entries.size).toBe(0)

    settingsDb.failReads = false
    settingsDb.rows.product_settings = { maintenanceMode: true }
    expect((await SettingsService.getProductSettings()).maintenanceMode).toBe(true)
  })

  it('reads directly when the data cache is unavailable (the proxy path outside a request scope)', async () => {
    settingsDb.rows.product_settings = { allowSignups: false }
    const { SettingsService, nextCache } = await loadSettings()
    vi.mocked(nextCache.unstable_cache).mockImplementation((() => async () => {
      throw new Error('Invariant: incrementalCache missing in unstable_cache')
    }) as never)

    expect((await SettingsService.getProductSettings()).allowSignups).toBe(false)
  })
})
