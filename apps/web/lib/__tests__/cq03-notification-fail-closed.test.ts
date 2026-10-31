import { describe, it, expect, vi, beforeEach } from 'vitest'

// CQ-03: a failed suppression or preferences read must block the send, not fall
// through to "not suppressed" / "default preferences (opted in)".

vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    isEnabledAsync: vi.fn(async () => true),
    ensureHydrated: vi.fn(async () => undefined),
  },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100000 })),
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
    getDigestSchedules: vi.fn(async () => ({
      dailyReminder: { enabled: true, hourUtc: 9 },
      weeklyRecap: { enabled: true, dayOfWeek: 0, hourUtc: 18 },
    })),
    recordDigestRun: vi.fn(async () => undefined),
  },
}))

vi.mock('@/lib/flashcards-service', () => ({
  getDueCardsCount: vi.fn(async () => 4),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => undefined),
  logErrorReport: vi.fn(async () => undefined),
}))

vi.mock('@/lib/growth/fetch-all-rows', () => ({
  fetchAllRows: vi.fn(async () => ({
    data: [{ user_id: 'u-0001', xp_amount: 50, created_at: new Date().toISOString() }],
    error: null,
  })),
}))

vi.mock('@/lib/growth/proof-state-db', () => ({
  loadProofStates: vi.fn(async () => new Map()),
}))

vi.mock('@/lib/referral/referral-service', () => ({
  resolveReferralRewardXp: vi.fn(async () => 100),
}))

import * as supabaseModule from '@/lib/supabase'
import { logSystemError } from '@/lib/monitoring/logger'
import {
  getResolvedUserNotificationPreferences,
  NotificationPreferencesReadError,
} from '../notifications/preferences/defaults'
import { enqueueNotificationItem } from '../notifications/queue/processor'
import { POST as handleDailyReminder } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecap } from '../../app/api/cron/weekly-recap/route'

const TEST_CRON_SECRET = 'test-cron-secret'
const CRON_HEADERS = { Authorization: `Bearer ${TEST_CRON_SECRET}` }

beforeEach(() => {
  process.env.CRON_SECRET = TEST_CRON_SECRET
  vi.mocked(logSystemError).mockClear()
})

type Read = { data: unknown; error: { message: string } | null } | 'throw'

function resolveRead(read: Read) {
  if (read === 'throw') return Promise.reject(new Error('network down'))
  return Promise.resolve(read)
}

const OK_EMPTY: Read = { data: null, error: null }

/** Supabase mock for enqueueNotificationItem: suppression + single preferences row reads. */
function enqueueSupabase({
  suppressionRead = OK_EMPTY,
  prefRead = OK_EMPTY,
  inserts,
  skipped,
}: {
  suppressionRead?: Read
  prefRead?: Read
  inserts: Array<Record<string, unknown>>
  skipped: string[]
}) {
  return {
    from: (table: string) => {
      if (table === 'email_suppressions') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => resolveRead(suppressionRead) }) }) }
      }
      if (table === 'user_notification_preferences') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => resolveRead(prefRead) }) }) }
      }
      if (table === 'email_queue') {
        return {
          insert: (obj: Record<string, unknown>) => {
            inserts.push(obj)
            return { select: () => ({ single: async () => ({ data: { id: `q-${inserts.length}` }, error: null }) }) }
          },
        }
      }
      if (table === 'notification_events') {
        return {
          insert: async (row: { skipped_reason: string }) => {
            skipped.push(row.skipped_reason)
            return { data: null, error: null }
          },
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    },
  }
}

const base = {
  userId: 'u-1',
  toEmail: 'learner@example.com',
  channel: 'email' as const,
  templateKey: 'learning.daily_reminder',
  templateVariables: { userName: 'L' },
  eventType: 'learning.daily_reminder',
  category: 'learning' as const,
  priorityLevel: 'medium' as const,
}

describe('CQ-03 enqueueNotificationItem fails closed', () => {
  it('a suppression read that returns an error blocks the send and records the skip', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const skipped: string[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ suppressionRead: { data: null, error: { message: 'timeout' } }, inserts, skipped }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'cq03-sup-err' })
    expect(res).toEqual({ success: false, reason: 'Suppression check failed; send blocked' })
    expect(inserts).toHaveLength(0)
    expect(skipped).toContain('suppression_check_failed')
  })

  it('a suppression read that throws blocks the send and records the skip', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const skipped: string[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ suppressionRead: 'throw', inserts, skipped }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'cq03-sup-throw' })
    expect(res.success).toBe(false)
    expect(inserts).toHaveLength(0)
    expect(skipped).toContain('suppression_check_failed')
  })

  it('a preferences read error blocks the send instead of assuming defaults', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const skipped: string[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ prefRead: { data: null, error: { message: 'permission denied' } }, inserts, skipped }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'cq03-pref-err' })
    expect(res.success).toBe(false)
    expect(res.reason).toMatch(/preferences/i)
    expect(inserts).toHaveLength(0)
    expect(skipped).toContain('preferences_read_failed')
  })

  it.each(['auth.verify_email', 'auth.password_reset'])(
    'critical %s still enqueues when the suppression read throws and the preferences read errors',
    async (templateKey) => {
      const inserts: Array<Record<string, unknown>> = []
      const skipped: string[] = []
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
        enqueueSupabase({
          suppressionRead: 'throw',
          prefRead: { data: null, error: { message: 'permission denied' } },
          inserts,
          skipped,
        }) as never
      )
      const res = await enqueueNotificationItem({
        ...base,
        templateKey,
        eventType: templateKey,
        category: 'security',
        idempotencyKey: `cq03-critical-${templateKey}`,
      })
      expect(res.success).toBe(true)
      expect(inserts).toHaveLength(1)
      expect(skipped).not.toContain('suppression_check_failed')
      expect(skipped).not.toContain('preferences_read_failed')
    }
  )

  it('a clean read with no suppression and no preference row still sends (control)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const skipped: string[] = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ inserts, skipped }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'cq03-ok' })
    expect(res.success).toBe(true)
    expect(inserts).toHaveLength(1)
  })
})

describe('CQ-03 getResolvedUserNotificationPreferences strict mode', () => {
  function prefClient(read: Read) {
    return {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => resolveRead(read) }) }) }),
    }
  }

  it('strict: a query error throws NotificationPreferencesReadError', async () => {
    await expect(
      getResolvedUserNotificationPreferences(prefClient({ data: null, error: { message: 'boom' } }), 'u-1', { strict: true })
    ).rejects.toBeInstanceOf(NotificationPreferencesReadError)
  })

  it('strict: a thrown read throws NotificationPreferencesReadError', async () => {
    await expect(
      getResolvedUserNotificationPreferences(prefClient('throw'), 'u-1', { strict: true })
    ).rejects.toBeInstanceOf(NotificationPreferencesReadError)
  })

  it('strict: a missing row still resolves to defaults', async () => {
    const prefs = await getResolvedUserNotificationPreferences(prefClient(OK_EMPTY), 'u-1', { strict: true })
    expect(prefs.userId).toBe('u-1')
    expect(prefs.learning.email).toBe(true)
  })

  it('non-strict: a query error still resolves to defaults (unchanged behavior)', async () => {
    const prefs = await getResolvedUserNotificationPreferences(prefClient({ data: null, error: { message: 'boom' } }), 'u-1')
    expect(prefs.userId).toBe('u-1')
    const thrown = await getResolvedUserNotificationPreferences(prefClient('throw'), 'u-1')
    expect(thrown.userId).toBe('u-1')
  })
})

/** Keyset-aware `users` query builder mock: supports select().not().[gt(id)].order().limit(). */
function usersBuilder(usersArr: Array<Record<string, unknown>>, gtCalls: string[]) {
  let cursor: string | null = null
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.not = () => b
  b.gt = (col: string, val: string) => {
    if (col === 'id') {
      cursor = val
      gtCalls.push(val)
    }
    return b
  }
  b.order = () => b
  b.limit = async (n: number) => {
    const filtered = cursor ? usersArr.filter((u) => String(u.id) > cursor!) : usersArr
    return { data: filtered.slice(0, n), error: null }
  }
  return b
}

/** Chainable, awaitable builder that resolves to `result` whatever filters are applied. */
function thenableBuilder(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'in', 'eq', 'gte', 'order', 'range']) b[m] = () => b
  b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return b
}

function makeUser(n: number) {
  const id = `u-${String(n).padStart(4, '0')}`
  return { id, email: `${id}@example.com`, name: id, current_streak: 0, last_streak_date: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), timezone: 'UTC', total_xp: 10 }
}

const ONE_USER = [makeUser(1)]

/**
 * Cron Supabase mock. `failPrefsOnCall` lists the 1-based batch preferences reads that
 * fail; every other read succeeds with no rows. `stats` records the users queries and
 * the keyset cursors they received.
 */
function cronSupabase({
  users = ONE_USER,
  failPrefsOnCall,
  inserts,
  stats = { usersQueries: 0, gtCalls: [] },
}: {
  users?: Array<Record<string, unknown>>
  failPrefsOnCall: number[]
  inserts: Array<Record<string, unknown>>
  stats?: { usersQueries: number; gtCalls: string[] }
}) {
  let prefsCalls = 0
  return {
    from: (table: string) => {
      if (table === 'users') {
        stats.usersQueries++
        return usersBuilder(users, stats.gtCalls)
      }
      if (table === 'user_notification_preferences') {
        return {
          select: () => ({
            in: async () => {
              prefsCalls++
              return failPrefsOnCall.includes(prefsCalls)
                ? { data: null, error: { message: 'statement timeout' } }
                : { data: [], error: null }
            },
            eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
          }),
        }
      }
      if (table === 'user_lesson_progress') {
        return thenableBuilder({ data: users.map((u) => ({ user_id: u.id })), error: null })
      }
      if (table === 'email_suppressions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      if (table === 'email_queue') {
        return {
          insert: (obj: Record<string, unknown>) => {
            inserts.push(obj)
            return { select: () => ({ single: async () => ({ data: { id: `q-${inserts.length}` }, error: null }) }) }
          },
        }
      }
      if (table === 'notification_events') return { insert: async () => ({ data: null, error: null }) }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
    },
  }
}

function loggedOperations(): string[] {
  return vi.mocked(logSystemError).mock.calls.map((c) => (c[0] as { operation: string }).operation)
}

describe('CQ-03 crons skip a page when the preferences read fails', () => {
  it('daily-reminder sends nothing and logs when the batch preferences read fails', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(cronSupabase({ failPrefsOnCall: [1], inserts }) as never)
    const res = await handleDailyReminder(
      new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(body.remindersQueued).toBe(0)
    expect(body.skippedPages).toBe(1)
    expect(inserts).toHaveLength(0)
    expect(loggedOperations()).toContain('cron_daily_reminder_preferences')
  })

  it('daily-reminder still sends when the preferences read succeeds (control)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(cronSupabase({ failPrefsOnCall: [], inserts }) as never)
    const res = await handleDailyReminder(
      new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(body.remindersQueued).toBe(1)
    expect(body.skippedPages).toBe(0)
    expect(inserts).toHaveLength(1)
  })

  it('weekly-recap sends nothing and logs when the batch preferences read fails', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(cronSupabase({ failPrefsOnCall: [1], inserts }) as never)
    const res = await handleWeeklyRecap(
      new Request('http://localhost/api/cron/weekly-recap?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(body.recapsQueued).toBe(0)
    expect(body.skippedPages).toBe(1)
    expect(inserts).toHaveLength(0)
    expect(loggedOperations()).toContain('cron_weekly_recap_preferences')
  })

  it('weekly-recap still sends when the preferences read succeeds (control)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(cronSupabase({ failPrefsOnCall: [], inserts }) as never)
    const res = await handleWeeklyRecap(
      new Request('http://localhost/api/cron/weekly-recap?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(body.recapsQueued).toBe(1)
    expect(body.skippedPages).toBe(0)
    expect(inserts).toHaveLength(1)
  })
})

describe('CQ-03 a skipped page still advances the keyset cursor', () => {
  // 101 users: page 1 holds u-0001..u-0100, page 2 holds u-0101 alone.
  const users = Array.from({ length: 101 }, (_, i) => makeUser(i + 1))

  it('daily-reminder skips page 1 on a failed preferences read and still processes page 2', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const stats = { usersQueries: 0, gtCalls: [] as string[] }
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      cronSupabase({ users, failPrefsOnCall: [1], inserts, stats }) as never
    )
    const res = await handleDailyReminder(
      new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(stats.usersQueries).toBe(2)
    expect(stats.gtCalls).toEqual(['u-0100'])
    expect(inserts).toHaveLength(1)
    expect(inserts[0].user_id).toBe('u-0101')
    expect(body.remindersQueued).toBe(1)
    expect(body.skippedPages).toBe(1)
    expect(loggedOperations()).toContain('cron_daily_reminder_preferences')
  })

  it('weekly-recap skips page 1 on a failed preferences read and still processes page 2', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const stats = { usersQueries: 0, gtCalls: [] as string[] }
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      cronSupabase({ users, failPrefsOnCall: [1], inserts, stats }) as never
    )
    const res = await handleWeeklyRecap(
      new Request('http://localhost/api/cron/weekly-recap?force=true', { method: 'POST', headers: CRON_HEADERS })
    )
    const body = await res.json()
    expect(stats.usersQueries).toBe(2)
    expect(stats.gtCalls).toEqual(['u-0100'])
    expect(inserts).toHaveLength(1)
    expect(inserts[0].user_id).toBe('u-0101')
    expect(body.recapsQueued).toBe(1)
    expect(body.skippedPages).toBe(1)
    expect(loggedOperations()).toContain('cron_weekly_recap_preferences')
  })
})
