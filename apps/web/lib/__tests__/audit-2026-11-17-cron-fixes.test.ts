import { describe, it, expect, vi, beforeEach } from 'vitest'

// Code audit 2026-11-17, findings 3, 5, 9, 16 and the fetchAllRows merge:
// - a failed users read or a caught exception makes weekly-recap and daily-reminder answer 500,
//   so withCronHeartbeat records the run as failed;
// - weekly-recap skips a page when the XP or lesson read fails, and pages the lesson read;
// - weekly-recap falls back to the profile timezone when there is no preferences row;
// - daily-reminder reads due-card counts once per page, not once per learner.

const hoisted = vi.hoisted(() => ({ afterCallbacks: [] as Array<() => unknown> }))

// The shared setup mock of next/server has no `after`; the routes need one on error paths.
vi.mock('next/server', () => {
  class MockNextResponse extends Response {
    static json(data: unknown, init?: ResponseInit) {
      return new MockNextResponse(JSON.stringify(data), {
        ...init,
        headers: { 'Content-Type': 'application/json', ...((init?.headers as Record<string, string>) || {}) },
      })
    }
  }
  return {
    NextRequest: Request,
    NextResponse: MockNextResponse,
    after: (cb: () => unknown) => {
      hoisted.afterCallbacks.push(cb)
    },
  }
})

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
    getDigestSchedules: vi.fn(async () => ({
      dailyReminder: { enabled: true, hourUtc: 9 },
      weeklyRecap: { enabled: true, dayOfWeek: 0, hourUtc: 18 },
    })),
    recordDigestRun: vi.fn(async () => undefined),
  },
}))

vi.mock('@/lib/notifications/preferences/defaults', () => ({
  getBatchUserNotificationPreferences: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/notifications/queue/processor', () => ({
  enqueueNotificationItem: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/notifications/send-window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/send-window')>()),
  findQueuedIdempotencyKeys: vi.fn(async () => new Set<string>()),
}))

vi.mock('@/lib/notifications/timezone', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/notifications/timezone')>()
  return { ...real, getUserLocalTime: vi.fn(real.getUserLocalTime) }
})

vi.mock('@/lib/flashcards-due-counts', () => ({
  getDueCardsCounts: vi.fn(async (_s: unknown, ids: readonly string[]) => new Map(ids.map((id) => [id, 4]))),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => null),
  logErrorReport: vi.fn(async () => undefined),
}))

vi.mock('@/lib/growth/proof-state-db', () => ({
  loadProofStates: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/referral/referral-service', () => ({
  resolveReferralRewardXp: vi.fn(async () => 100),
}))

import * as supabaseModule from '@/lib/supabase'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { getBatchUserNotificationPreferences } from '@/lib/notifications/preferences/defaults'
import { findQueuedIdempotencyKeys } from '@/lib/notifications/send-window'
import { getUserLocalTime } from '@/lib/notifications/timezone'
import { getDueCardsCounts } from '@/lib/flashcards-due-counts'
import { logSystemError } from '@/lib/monitoring/logger'
import { POST as handleDailyReminder } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecap } from '../../app/api/cron/weekly-recap/route'

const TEST_CRON_SECRET = 'test-cron-secret'
const CRON_HEADERS = { Authorization: `Bearer ${TEST_CRON_SECRET}` }

type Result = { data: unknown; error: { message: string } | null }
type Paged = (from: number, to: number) => Result

/**
 * Supabase fake for the two routes. `users` is keyset paged; every other table resolves to
 * `tables[name]` (a fixed result, or a function of the requested range). Heartbeat upserts to
 * `system_settings` are collected in `heartbeats`.
 */
function fakeSupabase(opts: {
  users?: Array<Record<string, unknown>>
  usersError?: string
  tables?: Record<string, Result | Paged>
  heartbeats: Array<{ key: string; value: { status: string } }>
  ranges?: Record<string, Array<[number, number]>>
}) {
  return {
    from: (table: string) => {
      let cursor: string | null = null
      let range: [number, number] = [0, 999]
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'not', 'in', 'eq', 'gte', 'order']) b[m] = () => b
      b.gt = (_col: string, v: string) => {
        cursor = v
        return b
      }
      b.range = (from: number, to: number) => {
        range = [from, to]
        ;(opts.ranges ??= {})[table] = [...(opts.ranges[table] ?? []), [from, to]]
        return b
      }
      b.limit = async (n: number) => {
        if (opts.usersError) return { data: null, error: { message: opts.usersError } }
        const rows = (opts.users ?? []).filter((u) => cursor === null || String(u.id) > cursor)
        return { data: rows.slice(0, n), error: null }
      }
      b.maybeSingle = async () => ({ data: null, error: null })
      b.upsert = async (row: { key: string; value: { status: string } }) => {
        // cron_cursor:* rows are the paging cursor (lib/notifications/run-cursor), not heartbeats.
        if (table === 'system_settings' && !row.key.startsWith('cron_cursor:')) opts.heartbeats.push(row)
        return { data: null, error: null }
      }
      b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const entry = opts.tables?.[table]
        const result = typeof entry === 'function' ? entry(...range) : (entry ?? { data: [], error: null })
        return Promise.resolve(result).then(resolve, reject)
      }
      return b
    },
  }
}

const today = new Date().toISOString().slice(0, 10)
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

function learner(n: number, extra: Record<string, unknown> = {}) {
  const id = `u-${String(n).padStart(4, '0')}`
  return {
    id,
    email: `${id}@example.com`,
    name: id,
    created_at: '2026-01-01T00:00:00Z',
    current_streak: 1,
    longest_streak: 3,
    streak_freezes_available: 0,
    last_streak_date: yesterday,
    timezone: 'UTC',
    ...extra,
  }
}

function req(path: string, force = true) {
  return new Request(`http://localhost/api/cron/${path}${force ? '?force=true' : ''}`, { method: 'POST', headers: CRON_HEADERS })
}

function loggedOperations(): string[] {
  return vi.mocked(logSystemError).mock.calls.map((c) => (c[0] as { operation: string }).operation)
}

beforeEach(() => {
  process.env.CRON_SECRET = TEST_CRON_SECRET
  hoisted.afterCallbacks.length = 0
  vi.mocked(enqueueNotificationItem).mockClear()
  vi.mocked(logSystemError).mockClear()
  vi.mocked(getUserLocalTime).mockClear()
  vi.mocked(getDueCardsCounts).mockClear()
  vi.mocked(getBatchUserNotificationPreferences).mockReset().mockResolvedValue(new Map())
  vi.mocked(findQueuedIdempotencyKeys).mockReset().mockResolvedValue(new Set())
})

describe('audit #3: a failed run answers 500 so the heartbeat records failed', () => {
  it('weekly-recap: a failed users read is a 500 and a failed heartbeat', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ usersError: 'relation missing', heartbeats }) as never)
    const res = await handleWeeklyRecap(req('weekly-recap'))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    expect(loggedOperations()).toContain('cron_weekly_recap_query')
    expect(heartbeats.find((h) => h.key === 'cron_heartbeat:weekly-recap')?.value.status).toBe('failed')
  })

  it('weekly-recap: a caught exception is a 500 and a failed heartbeat', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.mocked(findQueuedIdempotencyKeys).mockRejectedValue(new Error('queue read down'))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({
        users: [learner(1)],
        tables: { xp_events: { data: [{ user_id: 'u-0001', xp_amount: 10, created_at: new Date().toISOString() }], error: null } },
        heartbeats,
      }) as never
    )
    const res = await handleWeeklyRecap(req('weekly-recap'))
    expect(res.status).toBe(500)
    expect(loggedOperations()).toContain('cron_weekly_recap_exception')
    expect(heartbeats.find((h) => h.key === 'cron_heartbeat:weekly-recap')?.value.status).toBe('failed')
  })

  it('daily-reminder: a failed users read is a 500 and a failed heartbeat', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ usersError: 'boom', heartbeats }) as never)
    const res = await handleDailyReminder(req('daily-reminder'))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    expect(heartbeats.find((h) => h.key === 'cron_heartbeat:daily-reminder')?.value.status).toBe('failed')
  })

  it('daily-reminder: a caught exception is a 500 and a failed heartbeat', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.mocked(findQueuedIdempotencyKeys).mockRejectedValue(new Error('queue read down'))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ users: [learner(1)], heartbeats }) as never)
    const res = await handleDailyReminder(req('daily-reminder'))
    expect(res.status).toBe(500)
    await Promise.all(hoisted.afterCallbacks.map((cb) => cb()))
    expect(loggedOperations()).toContain('cron_daily_reminder_exception')
    expect(heartbeats.find((h) => h.key === 'cron_heartbeat:daily-reminder')?.value.status).toBe('failed')
  })

  it('a skipped page on a failed preferences read stays a 200 (deliberate skip)', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.mocked(getBatchUserNotificationPreferences).mockRejectedValue(new Error('prefs down'))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fakeSupabase({ users: [learner(1)], heartbeats }) as never)
    const weekly = await handleWeeklyRecap(req('weekly-recap'))
    const daily = await handleDailyReminder(req('daily-reminder'))
    expect(weekly.status).toBe(200)
    expect(daily.status).toBe(200)
    expect((await weekly.json()).skippedPages).toBe(1)
    expect((await daily.json()).skippedPages).toBe(1)
    expect(heartbeats.every((h) => h.value.status === 'healthy')).toBe(true)
  })
})

describe('audit #5: weekly-recap checks the XP and lesson reads', () => {
  const xpOk: Result = { data: [{ user_id: 'u-0001', xp_amount: 30, created_at: new Date().toISOString() }], error: null }
  const lessonsOk: Result = { data: [{ user_id: 'u-0001' }], error: null }

  it.each([
    ['XP', { xp_events: { data: null, error: { message: 'xp down' } }, user_lesson_progress: lessonsOk }],
    ['lesson', { xp_events: xpOk, user_lesson_progress: { data: null, error: { message: 'progress down' } } }],
  ] as const)('a failed %s read skips the page and sends nothing', async (_label, tables) => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ users: [learner(1)], tables: tables as Record<string, Result>, heartbeats }) as never
    )
    const res = await handleWeeklyRecap(req('weekly-recap'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.skippedPages).toBe(1)
    expect(body.recapsQueued).toBe(0)
    expect(enqueueNotificationItem).not.toHaveBeenCalled()
    expect(loggedOperations()).toContain('cron_weekly_recap_activity')
  })

  it('pages the lesson read past the 1000-row cap', async () => {
    const heartbeats: Array<{ key: string; value: { status: string } }> = []
    const ranges: Record<string, Array<[number, number]>> = {}
    const lessonRows = Array.from({ length: 1500 }, () => ({ user_id: 'u-0001' }))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({
        users: [learner(1)],
        tables: { xp_events: xpOk, user_lesson_progress: (from, to) => ({ data: lessonRows.slice(from, to + 1), error: null }) },
        heartbeats,
        ranges,
      }) as never
    )
    const body = await (await handleWeeklyRecap(req('weekly-recap'))).json()
    expect(body.recapsQueued).toBe(1)
    expect(ranges.user_lesson_progress).toEqual([[0, 999], [1000, 1999]])
    const vars = vi.mocked(enqueueNotificationItem).mock.calls[0][0].templateVariables as Record<string, unknown>
    expect(vars.lessonsCompletedThisWeek).toBe(1500)
  })
})

describe('audit #9: weekly-recap timezone fallback', () => {
  function run(prefs: Map<string, unknown>) {
    vi.mocked(getBatchUserNotificationPreferences).mockResolvedValue(prefs as never)
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ users: [learner(1, { timezone: 'Asia/Kolkata' })], heartbeats: [] }) as never
    )
    return handleWeeklyRecap(req('weekly-recap', false))
  }

  it('uses users.timezone when there is no preferences row', async () => {
    await run(new Map())
    expect(vi.mocked(getUserLocalTime).mock.calls.map((c) => c[0])).toEqual(['Asia/Kolkata'])
  })

  it('the preferences row timezone still wins', async () => {
    await run(new Map([['u-0001', { timezone: 'America/New_York' }]]))
    expect(vi.mocked(getUserLocalTime).mock.calls.map((c) => c[0])).toEqual(['America/New_York'])
  })
})

describe('audit #16: daily-reminder reads due-card counts once per page', () => {
  it('one batched read for every eligible learner on the page, zero-due learners suppressed', async () => {
    vi.mocked(getDueCardsCounts).mockImplementationOnce(
      async () => new Map([['u-0001', 2], ['u-0002', 0], ['u-0003', 9]])
    )
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({
        users: [learner(1), learner(2), learner(3), learner(4, { last_streak_date: today })],
        heartbeats: [],
      }) as never
    )
    const body = await (await handleDailyReminder(req('daily-reminder'))).json()
    expect(getDueCardsCounts).toHaveBeenCalledTimes(1)
    // The learner active today is filtered out before the read.
    expect(vi.mocked(getDueCardsCounts).mock.calls[0][1]).toEqual(['u-0001', 'u-0002', 'u-0003'])
    expect(body.remindersQueued).toBe(2)
    expect(body.remindersSkippedNoDueCards).toBe(1)
    expect(body.remindersSkippedActiveToday).toBe(1)
    const sent = vi.mocked(enqueueNotificationItem).mock.calls.map((c) => [c[0].userId, (c[0].templateVariables as { dueCount: number }).dueCount])
    expect(sent).toEqual([['u-0001', 2], ['u-0003', 9]])
  })

  it('a failed batched read suppresses the page instead of failing the run', async () => {
    vi.mocked(getDueCardsCounts).mockRejectedValueOnce(new Error('srs down'))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      fakeSupabase({ users: [learner(1), learner(2)], heartbeats: [] }) as never
    )
    const res = await handleDailyReminder(req('daily-reminder'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.remindersQueued).toBe(0)
    expect(body.remindersSkippedNoDueCards).toBe(2)
  })
})

describe('one fetchAllRows (lib/db/pagination.ts)', () => {
  it('the growth copy is gone and its callers use the kept helper', async () => {
    const { existsSync, readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const web = path.resolve(__dirname, '../..')
    expect(existsSync(path.join(web, 'lib/growth/fetch-all-rows.ts'))).toBe(false)
    for (const rel of ['app/api/cron/weekly-recap/route.ts', 'lib/growth/lifecycle-run.ts', 'lib/growth/proof-state-db.ts', 'lib/flashcards-due-counts.ts']) {
      expect(readFileSync(path.join(web, rel), 'utf8')).toContain("from '@/lib/db/pagination'")
    }
    expect(readFileSync(path.join(web, 'lib/db/pagination.ts'), 'utf8')).toMatch(/stable, total order/)
  })
})
