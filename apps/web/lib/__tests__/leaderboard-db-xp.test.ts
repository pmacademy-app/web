/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B8-A — regression suite for F-COR-1.
 *
 * `getOrBuildWeeklyRawMetrics()` selected `xp_events.amount`; the column is
 * `xp_amount`. PostgREST rejects the unknown column, and the call destructured only
 * `data`, so the error was discarded, `data` was null, and every user's weekly XP
 * reduced to 0 with nothing logged.
 *
 * These tests pin both halves: the value actually read, and the fact that a failing
 * query is now reported rather than silently producing a zeroed board.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLogErrorReport = vi.fn()

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: (...args: any[]) => mockLogErrorReport(...args),
}))

/** Columns requested per table, captured so a test can assert the real column name. */
let selectedColumns: Record<string, string> = {}
/** Rows returned per table. */
let tableRows: Record<string, any[]> = {}
/** Error returned per table, if any. */
let tableErrors: Record<string, any> = {}

function createChain(table: string) {
  const chain: any = {
    select: vi.fn((cols?: string) => {
      selectedColumns[table] = cols ?? ''
      return chain
    }),
    eq: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    in: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) =>
      resolve({
        data: tableErrors[table] ? null : (tableRows[table] ?? []),
        error: tableErrors[table] ?? null,
      }),
  }
  return chain
}

const supabase: any = { from: vi.fn((table: string) => createChain(table)) }

/**
 * The module holds a 45-second in-memory cache keyed by week start, so each test
 * re-imports it to get a clean cache rather than fighting the TTL.
 */
async function loadModule() {
  vi.resetModules()
  return import('../leaderboard-db')
}

const WEEK_START = '2026-09-07'
const USER_ID = '11111111-1111-1111-1111-111111111111'

function seedHealthyTables() {
  selectedColumns = {}
  tableErrors = {}
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

describe('B8-A · weekly leaderboard XP aggregation (F-COR-1)', () => {
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

  it('does not report anything when both queries succeed', async () => {
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
