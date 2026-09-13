/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-A / B8-C — regression suite for the weekly leaderboard aggregation.
 *
 * B8-A (F-COR-1): the XP query selected `xp_events.amount`; the column is `xp_amount`.
 * PostgREST rejected the query, the call destructured only `data`, so the error was
 * discarded, `data` was null, and every user's weekly XP reduced to 0 with nothing
 * logged.
 *
 * B8-C (F-COR-4): the same function issued unbounded selects that PostgREST truncates
 * at its row cap without reporting an error, and passed the entire user roster into a
 * `.in()` filter, which fails on URL length as the user base grows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogErrorReport = vi.fn()

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (...args: any[]) => mockLogErrorReport(...args),
}))

/** Columns requested per table. */
let selectedColumns: Record<string, string> = {}
/** Rows available per table — paged through by `.range()`. */
let tableRows: Record<string, any[]> = {}
/** Error returned per table, if any. */
let tableErrors: Record<string, any> = {}
/** Records whether a table was queried with an `.in()` filter, and how many ids. */
let inFilterSizes: Record<string, number> = {}
/** Every `.range()` window applied per table. */
let rangeCalls: Record<string, Array<[number, number]>> = {}

function createChain(table: string) {
  const chain: any = {
    select: vi.fn((cols?: string) => {
      selectedColumns[table] = cols ?? ''
      return chain
    }),
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    in: vi.fn((_field: string, ids: any[]) => {
      inFilterSizes[table] = ids.length
      return chain
    }),
    range: vi.fn((from: number, to: number) => {
      ;(rangeCalls[table] ||= []).push([from, to])
      chain._range = [from, to]
      return chain
    }),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => {
      if (tableErrors[table]) {
        return resolve({ data: null, error: tableErrors[table] })
      }
      const all = tableRows[table] ?? []
      const [from, to] = chain._range ?? [0, all.length - 1]
      return resolve({ data: all.slice(from, to + 1), error: null })
    },
  }
  return chain
}

const supabase: any = { from: vi.fn((table: string) => createChain(table)) }

/** The module holds a 45s cache keyed by week start; re-import for a clean one. */
async function loadModule() {
  vi.resetModules()
  return import('../leaderboard-db')
}

const WEEK_START = '2026-09-07'
const USER_ID = '11111111-1111-1111-1111-111111111111'

function seedHealthyTables() {
  selectedColumns = {}
  tableErrors = {}
  inFilterSizes = {}
  rangeCalls = {}
  tableRows = {
    users: [
      {
        id: USER_ID,
        username: 'learner',
        name: 'Learner',
        avatar_url: null,
        total_xp: 500,
        current_streak: 3,
        level: 2,
      },
    ],
    user_leaderboard_settings: [],
    user_lesson_progress: [
      { user_id: USER_ID, status: 'completed', completed_at: '2026-09-08T10:00:00.000Z' },
      { user_id: USER_ID, status: 'completed', completed_at: '2026-09-09T10:00:00.000Z' },
    ],
    // Shaped as the database actually shapes it: the column is `xp_amount`.
    xp_events: [
      { user_id: USER_ID, xp_amount: 30, created_at: '2026-09-08T10:00:00.000Z' },
      { user_id: USER_ID, xp_amount: 70, created_at: '2026-09-09T10:00:00.000Z' },
    ],
  }
}

beforeEach(() => {
  mockLogErrorReport.mockReset()
  seedHealthyTables()
})

describe('weekly leaderboard XP aggregation (F-COR-1)', () => {
  it('requests xp_amount, not amount', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(selectedColumns.xp_events).toContain('xp_amount')
    expect(selectedColumns.xp_events).not.toMatch(/(^|[\s,])amount([\s,]|$)/)
  })

  it('reports non-zero weekly XP for a user with XP events in the week', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    const entry = payload.entries.find((e) => e.userId === USER_ID)
    expect(entry).toBeDefined()
    // 30 + 70. Before the fix this was 0 for every user.
    expect(entry!.xpEarned).toBe(100)
  })

  it('still aggregates the other consistency metrics correctly', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    const entry = payload.entries.find((e) => e.userId === USER_ID)
    expect(entry!.lessonsCompleted).toBe(2)
    expect(entry!.daysStudied).toBe(2)
  })

  it('reports an XP query failure instead of silently returning a zeroed board', async () => {
    tableErrors.xp_events = { message: 'column xp_events.nope does not exist', code: '42703' }

    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)
    const report = mockLogErrorReport.mock.calls[0][0]
    expect(report.domain).toBe('db')
    expect(report.kind).toBe('db_unavailable')
    expect(report.operation).toBe('leaderboard.weekly_xp_events')
  })

  it('reports a lesson-progress query failure on the same path', async () => {
    tableErrors.user_lesson_progress = { message: 'boom', code: '08006' }

    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)
    expect(mockLogErrorReport.mock.calls[0][0].operation).toBe(
      'leaderboard.weekly_lesson_progress'
    )
  })

  it('does not report anything when every query succeeds', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(mockLogErrorReport).not.toHaveBeenCalled()
  })

  it('a reporting failure never propagates to the caller', async () => {
    tableErrors.xp_events = { message: 'boom' }
    mockLogErrorReport.mockRejectedValueOnce(new Error('incident sink is down'))

    const { getWeeklyLeaderboard } = await loadModule()
    await expect(getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)).resolves.toBeDefined()
  })
})

describe('bounded aggregation (F-COR-4)', () => {
  it('pages past the PostgREST row cap instead of truncating the roster', async () => {
    // 2,400 users: three pages at the helper's 1,000-row page size.
    tableRows.users = Array.from({ length: 2400 }, (_, i) => ({
      id: `user-${String(i).padStart(5, '0')}`,
      username: `u${i}`,
      name: `User ${i}`,
      avatar_url: null,
      total_xp: 100,
      current_streak: 0,
      level: 1,
    }))
    tableRows.user_lesson_progress = []
    tableRows.xp_events = []

    const { getWeeklyLeaderboard } = await loadModule()
    const payload = await getWeeklyLeaderboard(supabase, 'user-00000', WEEK_START)

    // Every user is represented, not just the first page.
    expect(payload.entries.length).toBe(2400)
    expect(rangeCalls.users.length).toBe(3)
    expect(rangeCalls.users[0]).toEqual([0, 999])
    expect(rangeCalls.users[2]).toEqual([2000, 2999])
  })

  it('aggregates XP across page boundaries', async () => {
    tableRows.xp_events = Array.from({ length: 1500 }, () => ({
      user_id: USER_ID,
      xp_amount: 2,
      created_at: '2026-09-08T10:00:00.000Z',
    }))

    const { getWeeklyLeaderboard } = await loadModule()
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    // 1500 × 2. A single truncated page would have yielded 2000.
    expect(payload.entries.find((e) => e.userId === USER_ID)!.xpEarned).toBe(3000)
  })

  it('no longer puts the whole user roster into an .in() filter', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(inFilterSizes.xp_events).toBeUndefined()
    expect(inFilterSizes.user_lesson_progress).toBeUndefined()
  })

  it('ignores rows belonging to users who are not on the board', async () => {
    tableRows.xp_events = [
      { user_id: USER_ID, xp_amount: 40, created_at: '2026-09-08T10:00:00.000Z' },
      { user_id: 'someone-else', xp_amount: 999, created_at: '2026-09-08T10:00:00.000Z' },
    ]

    const { getWeeklyLeaderboard } = await loadModule()
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)

    expect(payload.entries.find((e) => e.userId === USER_ID)!.xpEarned).toBe(40)
    expect(payload.entries.some((e) => e.userId === 'someone-else')).toBe(false)
  })

  it('does not cache a degraded board, so the next request retries', async () => {
    tableErrors.xp_events = { message: 'transient' }

    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(mockLogErrorReport).toHaveBeenCalledTimes(1)

    // Recover, then ask again inside the 45s TTL. A cached failure would pin the
    // zeroed board; a non-cached one re-queries and returns the real number.
    tableErrors = {}
    const payload = await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(payload.entries.find((e) => e.userId === USER_ID)!.xpEarned).toBe(100)
  })

  it('caches a complete board so the second call issues no further queries', async () => {
    const { getWeeklyLeaderboard } = await loadModule()
    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    const rangeCountAfterFirst = rangeCalls.users.length

    await getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)
    expect(rangeCalls.users.length).toBe(rangeCountAfterFirst)
  })

  it('suppresses the board rather than exposing opted-out users when the opt-out query fails', async () => {
    tableErrors.user_leaderboard_settings = { message: 'down' }

    const { getWeeklyLeaderboard } = await loadModule()
    await expect(getWeeklyLeaderboard(supabase, USER_ID, WEEK_START)).rejects.toBeTruthy()
    expect(mockLogErrorReport).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'leaderboard.weekly_opt_outs' })
    )
  })
})
