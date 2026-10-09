/**
 * Weekly leaderboard rebuild coordination (getOrBuildWeeklyRawMetrics):
 * - concurrent cache misses share one in-flight rebuild;
 * - a rebuild that fails outright is negative-cached for a short window, so an outage is
 *   not re-scanned on every request, and is retried once the window passes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

const mockLogErrorReport = vi.fn()
vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (...args: unknown[]) => mockLogErrorReport(...args),
}))

const USER_ID = 'user-1'
const WEEK_START = '2026-10-05'

const dbMocks = vi.hoisted(() => ({
  selectRankedUsers: vi.fn(),
  selectOptedOutUserIds: vi.fn(),
  selectWeeklyLessonProgress: vi.fn(),
  selectWeeklyXpEvents: vi.fn(),
  selectLeaderboardSettings: vi.fn(),
  selectSingleRankedUser: vi.fn(),
}))
vi.mock('@/lib/db/leaderboard', () => dbMocks)

const supabase = {} as SupabaseClient<Database>

async function loadModule() {
  vi.resetModules()
  return import('../leaderboard-db')
}

function seedHealthy() {
  dbMocks.selectRankedUsers.mockImplementation(async () => [
    { id: USER_ID, username: 'learner', name: 'Learner', avatar_url: null, total_xp: 500, current_streak: 2 },
  ])
  dbMocks.selectOptedOutUserIds.mockImplementation(async () => [])
  dbMocks.selectWeeklyLessonProgress.mockImplementation(async () => [
    { user_id: USER_ID, status: 'completed', completed_at: '2026-10-06T10:00:00.000Z' },
  ])
  dbMocks.selectWeeklyXpEvents.mockImplementation(async () => [
    { user_id: USER_ID, xp_amount: 40, created_at: '2026-10-06T10:00:00.000Z' },
  ])
  dbMocks.selectLeaderboardSettings.mockImplementation(async () => null)
  dbMocks.selectSingleRankedUser.mockImplementation(async () => null)
}

let now = 1_000_000

beforeEach(() => {
  for (const fn of Object.values(dbMocks)) fn.mockReset()
  mockLogErrorReport.mockReset()
  seedHealthy()
  now = 1_000_000
  vi.spyOn(Date, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('weekly leaderboard in-flight rebuild de-duplication', () => {
  it('runs the aggregation queries once for two concurrent calls on a cold cache', async () => {
    const { getWeeklyLeaderboard } = await loadModule()

    const [a, b] = await Promise.all([
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
    ])

    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(dbMocks.selectOptedOutUserIds).toHaveBeenCalledTimes(1)
    expect(dbMocks.selectWeeklyLessonProgress).toHaveBeenCalledTimes(1)
    expect(dbMocks.selectWeeklyXpEvents).toHaveBeenCalledTimes(1)
    expect(a.personalEntry?.daysStudied).toBe(1)
    expect(b.personalEntry?.daysStudied).toBe(1)
  })

  it('shares one in-flight rebuild between concurrent failing calls', async () => {
    dbMocks.selectOptedOutUserIds.mockImplementation(async () => {
      throw new Error('opt-out lookup down')
    })
    const { getWeeklyLeaderboard } = await loadModule()

    const results = await Promise.allSettled([
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
    ])

    expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(dbMocks.selectOptedOutUserIds).toHaveBeenCalledTimes(1)
  })
})

describe('weekly leaderboard negative cache for failed rebuilds', () => {
  it('does not re-scan within the window after a failed rebuild, and retries after it', async () => {
    dbMocks.selectOptedOutUserIds.mockImplementation(async () => {
      throw new Error('opt-out lookup down')
    })
    const { getWeeklyLeaderboard } = await loadModule()

    await expect(getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)).rejects.toThrow('opt-out lookup down')
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)

    // Inside the window: the same failure is surfaced without touching the database again,
    // and no duplicate incident is reported.
    now += 5_000
    await expect(getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)).rejects.toThrow('opt-out lookup down')
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(dbMocks.selectOptedOutUserIds).toHaveBeenCalledTimes(1)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)

    // After the window, with the database recovered: the board is rebuilt.
    dbMocks.selectOptedOutUserIds.mockImplementation(async () => [])
    now += 6_000
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(2)
    expect(payload.personalEntry?.daysStudied).toBe(1)
  })

  it('never negative-caches a partially degraded board, so the next request retries', async () => {
    dbMocks.selectWeeklyXpEvents.mockImplementation(async () => {
      throw new Error('transient')
    })
    const { getWeeklyLeaderboard } = await loadModule()

    const degraded = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(degraded.personalEntry?.xpEarned).toBe(0)
    expect(degraded.degraded).toBe(true)
    expect(mockLogErrorReport).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'leaderboard.weekly_xp_events' })
    )

    dbMocks.selectWeeklyXpEvents.mockImplementation(async () => [
      { user_id: USER_ID, xp_amount: 40, created_at: '2026-10-06T10:00:00.000Z' },
    ])
    now += 1_000
    const recovered = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(2)
    expect(recovered.personalEntry?.xpEarned).toBe(40)
  })

  it('flags the payload as degraded when the lesson-progress query fails', async () => {
    dbMocks.selectWeeklyLessonProgress.mockImplementation(async () => {
      throw new Error('lesson progress down')
    })
    const { getWeeklyLeaderboard } = await loadModule()

    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    // The learner studied this week; the 0 is the failed query, not their activity.
    expect(payload.personalEntry?.daysStudied).toBe(0)
    expect(payload.degraded).toBe(true)
    expect(mockLogErrorReport).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'leaderboard.weekly_lesson_progress' })
    )
  })

  it('flags the payload as degraded when the roster query fails', async () => {
    dbMocks.selectRankedUsers.mockImplementation(async () => {
      throw new Error('roster down')
    })
    dbMocks.selectSingleRankedUser.mockImplementation(async () => ({
      id: USER_ID,
      username: 'learner',
      name: 'Learner',
      avatar_url: null,
      total_xp: 500,
      current_streak: 2,
    }))
    const { getWeeklyLeaderboard } = await loadModule()

    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(payload.personalEntry?.daysStudied).toBe(0)
    expect(payload.degraded).toBe(true)
  })

  it('shares the degraded flag with every caller of one in-flight rebuild', async () => {
    dbMocks.selectWeeklyLessonProgress.mockImplementation(async () => {
      throw new Error('lesson progress down')
    })
    const { getWeeklyLeaderboard } = await loadModule()

    const [a, b] = await Promise.all([
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
      getWeeklyLeaderboard(supabase, USER_ID, WEEK_START),
    ])

    expect(dbMocks.selectWeeklyLessonProgress).toHaveBeenCalledTimes(1)
    expect(a.degraded).toBe(true)
    expect(b.degraded).toBe(true)
  })

  it('does not flag a healthy build, fresh or served from the cache', async () => {
    const { getWeeklyLeaderboard } = await loadModule()

    const fresh = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    now += 1_000
    const fromCache = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
    expect(fresh).not.toHaveProperty('degraded')
    expect(fromCache).not.toHaveProperty('degraded')
  })

  it('clears the degraded flag once the failed query recovers', async () => {
    dbMocks.selectWeeklyLessonProgress.mockImplementation(async () => {
      throw new Error('lesson progress down')
    })
    const { getWeeklyLeaderboard } = await loadModule()
    expect((await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)).degraded).toBe(true)

    dbMocks.selectWeeklyLessonProgress.mockImplementation(async () => [
      { user_id: USER_ID, status: 'completed', completed_at: '2026-10-06T10:00:00.000Z' },
    ])
    now += 1_000
    const recovered = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(recovered.degraded).toBeFalsy()
    expect(recovered.personalEntry?.daysStudied).toBe(1)
  })

  it('still serves a complete board from the 45s cache without new queries', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    now += 30_000
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(dbMocks.selectRankedUsers).toHaveBeenCalledTimes(1)
  })
})
