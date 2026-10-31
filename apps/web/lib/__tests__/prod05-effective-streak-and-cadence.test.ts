import { describe, it, expect, vi, beforeEach } from 'vitest'

// PROD-05: the daily reminder and the lifecycle streak-broken sequence read the EFFECTIVE streak
// (users.current_streak only resets on the next activity), and the daily reminder follows the
// Q8 cadence (days 0 to 3, then 7, 14, 30, then stop).

const hoisted = vi.hoisted(() => ({ afterCallbacks: [] as Array<() => unknown> }))

// The shared setup mock of next/server has no `after`; the route needs one. Callbacks are
// collected and run by the test, as Next runs them once the response is sent.
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

vi.mock('@/lib/flashcards-service', () => ({
  getDueCardsCount: vi.fn(async () => 4),
}))

vi.mock('@/lib/monitoring/cron-heartbeat', () => ({
  withCronHeartbeat: (_job: string, run: () => Promise<Response>) => run(),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => null),
  logErrorReport: vi.fn(async () => undefined),
}))

vi.mock('@/lib/notifications/send-window', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/notifications/send-window')>()),
  findQueuedIdempotencyKeys: vi.fn(async () => new Set<string>()),
}))

vi.mock('@/lib/notifications/lifecycle/holdout', () => ({
  isLifecycleHoldout: vi.fn(() => false),
}))

vi.mock('@/lib/growth/fetch-all-rows', () => ({
  fetchAllRows: vi.fn(async () => ({ data: [{ user_id: 'u-1', status: 'completed' }], error: null })),
}))

vi.mock('@/lib/growth/proof-state-db', () => ({
  loadProofStates: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/growth/proof-nudges-run', () => ({
  runProofNudgesForPage: vi.fn(async () => ({
    sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 },
    heldOut: 0,
    skipped: false,
    failed: 0,
  })),
}))

import * as supabaseModule from '@/lib/supabase'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { getDueCardsCount } from '@/lib/flashcards-service'
import { logSystemError } from '@/lib/monitoring/logger'
import { shiftLocalDate } from '@/lib/notifications/send-window'
import { getLocalDateString, getStreakStatusSummary } from '@/lib/streaks/streaks'
import { qualifiesStreakBroken, type LifecycleUserSnapshot } from '../notifications/lifecycle/segments'
import {
  REMINDER_DAILY_PHASE_MAX_DAYS,
  REMINDER_FOLLOW_UP_DAYS,
  daysSinceLastActivity,
  shouldSendReminder,
} from '../notifications/reminder-cadence'
import { runLifecycle } from '../growth/lifecycle-run'
import { POST as handleDailyReminder } from '../../app/api/cron/daily-reminder/route'

const TEST_CRON_SECRET = 'test-cron-secret'
const CRON_HEADERS = { Authorization: `Bearer ${TEST_CRON_SECRET}` }

/** Minimal keyset users query: select().not().gt?().order().limit(). */
function supabaseWithUsers(users: Array<Record<string, unknown>>, opts: { usersError?: string } = {}) {
  return {
    from: (table: string) => {
      if (table !== 'users') throw new Error(`unexpected table ${table}`)
      let afterId: string | null = null
      const builder = {
        select: () => builder,
        not: () => builder,
        gt: (_col: string, id: string) => {
          afterId = id
          return builder
        },
        order: () => builder,
        limit: async () =>
          opts.usersError
            ? { data: null, error: { message: opts.usersError } }
            : { data: users.filter((u) => afterId === null || String(u.id) > afterId), error: null },
      }
      return builder
    },
  }
}

function reminderRequest() {
  return new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS })
}

beforeEach(() => {
  process.env.CRON_SECRET = TEST_CRON_SECRET
  hoisted.afterCallbacks.length = 0
  vi.mocked(enqueueNotificationItem).mockClear()
  vi.mocked(getDueCardsCount).mockClear()
  vi.mocked(logSystemError).mockClear()
})

describe('PROD-05 reminder cadence (Q8)', () => {
  it('sends daily for days 0 to 3, then on days 7, 14 and 30, then stops', () => {
    expect(REMINDER_DAILY_PHASE_MAX_DAYS).toBe(3)
    expect(REMINDER_FOLLOW_UP_DAYS).toEqual([7, 14, 30])
    const sendDays = Array.from({ length: 61 }, (_, d) => d).filter((d) => shouldSendReminder(d))
    expect(sendDays).toEqual([0, 1, 2, 3, 7, 14, 30])
  })

  it('treats an unknown or negative age as day 0', () => {
    expect(shouldSendReminder(null)).toBe(true)
    expect(shouldSendReminder(-1)).toBe(true)
  })

  it('counts from last_streak_date, else from created_at in the learner timezone', () => {
    expect(daysSinceLastActivity({ lastStreakDate: '2026-10-20', createdAt: '2026-01-01T00:00:00Z', localDate: '2026-10-25', timezone: 'UTC' })).toBe(5)
    // 2026-10-20T23:30Z is already 2026-10-21 in Kolkata (UTC+5:30).
    expect(daysSinceLastActivity({ lastStreakDate: null, createdAt: '2026-10-20T23:30:00Z', localDate: '2026-10-25', timezone: 'Asia/Kolkata' })).toBe(4)
    expect(daysSinceLastActivity({ lastStreakDate: null, createdAt: null, localDate: '2026-10-25', timezone: 'UTC' })).toBeNull()
  })
})

describe('PROD-05 effective streak feeds the streak-broken segment', () => {
  it('last activity 3 days ago with a stored streak of 5 is effective 0 and qualifies as streak broken', () => {
    const now = new Date('2026-10-25T12:00:00Z')
    const summary = getStreakStatusSummary(
      { currentStreak: 5, longestStreak: 5, streakFreezesAvailable: 2, lastActivityDate: '2026-10-22' },
      'UTC',
      now
    )
    expect(summary.effectiveCurrentStreak).toBe(0)

    const base: LifecycleUserSnapshot = {
      createdAt: '2026-09-01T00:00:00Z',
      currentStreak: 5,
      longestStreak: 5,
      lastStreakDate: '2026-10-22',
      hasAnyProgress: true,
      hasCompletedLesson: true,
      localDate: '2026-10-25',
    }
    // The stored column never qualifies; the effective streak does.
    expect(qualifiesStreakBroken(base)).toBe(false)
    expect(qualifiesStreakBroken({ ...base, currentStreak: summary.effectiveCurrentStreak })).toBe(true)
  })

  it('runLifecycle assigns that learner to the streak-broken sequence', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      supabaseWithUsers([
        {
          id: 'u-1',
          email: 'lapsed@example.com',
          name: 'Lapsed',
          created_at: '2026-09-01T00:00:00Z',
          current_streak: 5,
          longest_streak: 5,
          streak_freezes_available: 2,
          last_streak_date: '2026-10-22',
          timezone: 'UTC',
        },
      ]) as never
    )
    const result = await runLifecycle({ source: 'cron', dryRun: true, force: true, now: new Date('2026-10-25T12:00:00Z') })
    expect(result.queuedBySequence['lifecycle.streak_broken']).toBe(1)
    expect(result.skippedNoSegment).toBe(0)
  })

  it('awaits logSystemError when the users query fails (no fire-and-forget)', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(supabaseWithUsers([], { usersError: 'boom' }) as never)
    await runLifecycle({ source: 'cron', dryRun: true, force: true, now: new Date('2026-10-25T12:00:00Z') })
    expect(vi.mocked(logSystemError).mock.calls.map((c) => c[0].operation)).toContain('cron_lifecycle_query')
  })
})

describe('PROD-05 daily reminder route', () => {
  const today = getLocalDateString('UTC', new Date())

  function learner(id: string, lastStreakDate: string | null, currentStreak: number) {
    return {
      id,
      email: `${id}@example.com`,
      name: id,
      created_at: '2026-01-01T00:00:00Z',
      current_streak: currentStreak,
      longest_streak: Math.max(currentStreak, 5),
      streak_freezes_available: 0,
      last_streak_date: lastStreakDate,
      timezone: 'UTC',
    }
  }

  it('sends no reminder to a learner lapsed 5 days (and reads no due cards for them)', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      supabaseWithUsers([learner('u-1', shiftLocalDate(today, -5), 5)]) as never
    )
    const body = await (await handleDailyReminder(reminderRequest())).json()
    expect(body.remindersQueued).toBe(0)
    expect(body.remindersSkippedCadence).toBe(1)
    expect(enqueueNotificationItem).not.toHaveBeenCalled()
    expect(getDueCardsCount).not.toHaveBeenCalled()
  })

  it('sends on day 7 and passes the effective streak (0), not the stored one', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      supabaseWithUsers([learner('u-1', shiftLocalDate(today, -7), 5)]) as never
    )
    const body = await (await handleDailyReminder(reminderRequest())).json()
    expect(body.remindersQueued).toBe(1)
    const vars = vi.mocked(enqueueNotificationItem).mock.calls[0][0].templateVariables as Record<string, unknown>
    expect(vars.currentStreak).toBe(0)
    expect(vars.longestStreak).toBe(5)
  })

  it('keeps a live streak when the learner was active yesterday', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      supabaseWithUsers([learner('u-1', shiftLocalDate(today, -1), 4)]) as never
    )
    const body = await (await handleDailyReminder(reminderRequest())).json()
    expect(body.remindersQueued).toBe(1)
    const vars = vi.mocked(enqueueNotificationItem).mock.calls[0][0].templateVariables as Record<string, unknown>
    expect(vars.currentStreak).toBe(4)
  })

  it('logs a users query failure through after(), not fire-and-forget', async () => {
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(supabaseWithUsers([], { usersError: 'boom' }) as never)
    const res = await handleDailyReminder(reminderRequest())
    expect(res.status).toBe(200)
    expect(logSystemError).not.toHaveBeenCalled()
    expect(hoisted.afterCallbacks).toHaveLength(1)
    await hoisted.afterCallbacks[0]()
    expect(vi.mocked(logSystemError).mock.calls[0][0].operation).toBe('cron_daily_reminder_query')
  })
})
