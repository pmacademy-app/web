import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Module isolation ─────────────────────────────────────────────────────────
// Feature flags on, automations enabled + not paused, generous daily quota.
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

// Real SRS due-card computation is stubbed; the daily reminder passes whatever this
// returns and suppresses when it is zero.
vi.mock('@/lib/flashcards-service', () => ({
  getDueCardsCount: vi.fn(async () => 0),
}))

import * as supabaseModule from '@/lib/supabase'
import { getDueCardsCount } from '@/lib/flashcards-service'
import {
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
  mapDbRowToNotificationPreferences,
} from '../notifications/preferences/defaults'
import { enqueueNotificationItem } from '../notifications/queue/processor'
import { POST as handleDailyReminder } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecap } from '../../app/api/cron/weekly-recap/route'
import { POST as handleLifecycle } from '../../app/api/cron/lifecycle/route'
import {
  isLifecycleHoldout,
  lifecycleBucket,
  DEFAULT_LIFECYCLE_HOLDOUT_PERCENT,
} from '../notifications/lifecycle/holdout'
import {
  resolveLifecycleSequence,
  qualifiesD1NeverStarted,
  qualifiesD3StartedNotFinished,
  qualifiesStreakBroken,
  daysBetweenLocalDates,
  type LifecycleUserSnapshot,
} from '../notifications/lifecycle/segments'

const TEST_CRON_SECRET = 'test-cron-secret'
const CRON_HEADERS = { Authorization: `Bearer ${TEST_CRON_SECRET}` }

// Pin CRON_SECRET so this suite is hermetic. The cron routes exercised below
// (daily-reminder, weekly-recap, lifecycle) authenticate the caller against
// process.env.CRON_SECRET, and every request here presents TEST_CRON_SECRET. The
// shared vitest setup only falls back to this value when CRON_SECRET is unset — but CI
// injects a real CRON_SECRET as a job-level secret, so without pinning it here the
// ambient value would win and every cron request would 401 (yielding an error body with
// no `remindersQueued`). Establishing it per-test matches the other cron suites
// (b7a/b7b/b7c) and keeps the production auth check itself untouched.
beforeEach(() => {
  process.env.CRON_SECRET = TEST_CRON_SECRET
})

/** Keyset-aware `users` query builder mock: supports select().not().[gt(id)].order().limit(). */
function usersBuilder(usersArr: Array<Record<string, unknown>>) {
  let cursor: string | null = null
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.not = () => b
  b.gt = (col: string, val: string) => {
    if (col === 'id') cursor = val
    return b
  }
  b.order = () => b
  b.limit = async (n: number) => {
    const filtered = cursor ? usersArr.filter((u) => String(u.id) > cursor!) : usersArr
    return { data: filtered.slice(0, n), error: null }
  }
  return b
}

// ── 1.1 / 1.2 — Preference resolution & defaults ─────────────────────────────
describe('Phase 1.1/1.2 — stored preference resolution & new email defaults', () => {
  it('1.2: absence of a preference row enables learning & achievement email by default', () => {
    const prefs = createDefaultNotificationPreferences('u-new')
    expect(prefs.learning.email).toBe(true)
    expect(prefs.achievements.email).toBe(true)
    // Marketing stays opt-in; in-app unchanged.
    expect(prefs.marketing.email).toBe(false)
    expect(prefs.learning.inApp).toBe(true)

    const resolvedNoRow = mapDbRowToNotificationPreferences('u-new', null)
    expect(isChannelEnabledByPreferences(resolvedNoRow, 'learning', 'email')).toBe(true)
    expect(isChannelEnabledByPreferences(resolvedNoRow, 'achievements', 'email')).toBe(true)
  })

  it('1.1: a stored explicit false blocks delivery (opt-out beats the new default)', () => {
    const prefs = mapDbRowToNotificationPreferences('u-optout', {
      user_id: 'u-optout',
      all_email: true,
      learning_email: false,
      achievements_email: false,
    })
    expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(false)
    expect(isChannelEnabledByPreferences(prefs, 'achievements', 'email')).toBe(false)
  })

  it('1.1: a stored explicit true permits delivery', () => {
    const prefs = mapDbRowToNotificationPreferences('u-optin', {
      user_id: 'u-optin',
      all_email: true,
      learning_email: true,
    })
    expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(true)
  })

  it('1.1: the three preference states stay distinct (no row vs false vs global off)', () => {
    // No row → default true
    expect(mapDbRowToNotificationPreferences('a', null).learning.email).toBe(true)
    // Row with explicit false → false
    expect(mapDbRowToNotificationPreferences('b', { user_id: 'b', learning_email: false }).learning.email).toBe(false)
    // Global email off masks the category regardless of the category value
    const globalOff = mapDbRowToNotificationPreferences('c', { user_id: 'c', all_email: false, learning_email: true })
    expect(isChannelEnabledByPreferences(globalOff, 'learning', 'email')).toBe(false)
  })
})

describe('Phase 1.1 — enqueueNotificationItem honours stored preferences, defaults and suppression', () => {
  function enqueueSupabase({ prefRow, suppressed = false, inserts }: {
    prefRow: Record<string, unknown> | null
    suppressed?: boolean
    inserts: Array<Record<string, unknown>>
  }) {
    return {
      from: (table: string) => {
        if (table === 'email_suppressions') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: suppressed ? { id: 'sup-1' } : null, error: null }) }) }) }
        }
        if (table === 'user_notification_preferences') {
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: prefRow, error: null }) }) }) }
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
          return { insert: async () => ({ data: null, error: null }) }
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
    idempotencyKey: 'k-1',
  }

  it('no preference row → new default (true) permits the learning email', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(enqueueSupabase({ prefRow: null, inserts }) as never)
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'k-nopref' })
    expect(res.success).toBe(true)
    expect(inserts).toHaveLength(1)
  })

  it('stored learning_email=false blocks the send', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ prefRow: { user_id: 'u-1', all_email: true, learning_email: false }, inserts }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'k-off' })
    expect(res.success).toBe(false)
    expect(res.reason).toMatch(/disabled 'learning'/)
    expect(inserts).toHaveLength(0)
  })

  it('a suppressed (unsubscribed/bounced) recipient is never sent to', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      enqueueSupabase({ prefRow: null, suppressed: true, inserts }) as never
    )
    const res = await enqueueNotificationItem({ ...base, idempotencyKey: 'k-sup' })
    expect(res.success).toBe(false)
    expect(res.reason).toMatch(/suppressed/)
    expect(inserts).toHaveLength(0)
  })
})

// ── 1.3 / 1.6 — Daily reminder audience & zero-due suppression ────────────────
describe('Phase 1.3/1.6 — daily reminder audience inversion & real due-card gating', () => {
  beforeEach(() => {
    vi.mocked(getDueCardsCount).mockReset()
  })

  function reminderSupabase({ users, prefRows = [], inserts }: {
    users: Array<Record<string, unknown>>
    prefRows?: Array<Record<string, unknown>>
    inserts: Array<Record<string, unknown>>
  }) {
    return {
      from: (table: string) => {
        if (table === 'users') return usersBuilder(users)
        if (table === 'user_notification_preferences') return { select: () => ({ in: async () => ({ data: prefRows, error: null }) }) }
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

  it('selects a lapsed user (streak broken) with due cards and passes the REAL due count', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.mocked(getDueCardsCount).mockResolvedValue(7)
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      reminderSupabase({
        users: [{ id: 'u-0001', email: 'lapsed@example.com', name: 'Lapsed', current_streak: 0, last_streak_date: '2020-01-01', timezone: 'UTC' }],
        inserts,
      }) as never
    )
    const res = await handleDailyReminder(new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.remindersQueued).toBe(1)
    expect(inserts).toHaveLength(1)
    const vars = inserts[0].template_variables as Record<string, unknown>
    expect(vars.dueCount).toBe(7) // real count, never the old hardcoded 5
  })

  it('suppresses a user whose real due count is zero (never-started / all-reviewed)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.mocked(getDueCardsCount).mockResolvedValue(0)
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      reminderSupabase({
        users: [{ id: 'u-0001', email: 'nocards@example.com', name: 'NoCards', current_streak: 0, last_streak_date: null, timezone: 'UTC' }],
        inserts,
      }) as never
    )
    const res = await handleDailyReminder(new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.remindersQueued).toBe(0)
    expect(body.remindersSkippedNoDueCards).toBe(1)
    expect(inserts).toHaveLength(0)
  })

  it('skips a user who already registered activity today (last_streak_date == local today)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.mocked(getDueCardsCount).mockResolvedValue(5)
    const todayUtc = new Date().toISOString().slice(0, 10)
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      reminderSupabase({
        users: [{ id: 'u-0001', email: 'active@example.com', name: 'Active', current_streak: 4, last_streak_date: todayUtc, timezone: 'UTC' }],
        inserts,
      }) as never
    )
    const res = await handleDailyReminder(new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.remindersQueued).toBe(0)
    expect(body.remindersSkippedActiveToday).toBe(1)
    // due count is never even computed for active-today users
    expect(getDueCardsCount).not.toHaveBeenCalled()
  })

  it('processes more than 100 eligible users across pages without skipping or duplicating', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.mocked(getDueCardsCount).mockResolvedValue(3)
    const users = Array.from({ length: 150 }, (_, i) => ({
      id: `u-${String(i).padStart(4, '0')}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      current_streak: 0,
      last_streak_date: null,
      timezone: 'UTC',
    }))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(reminderSupabase({ users, inserts }) as never)
    const res = await handleDailyReminder(new Request('http://localhost/api/cron/daily-reminder?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.remindersQueued).toBe(150)
    expect(inserts).toHaveLength(150)
    const uniqueUsers = new Set(inserts.map((i) => i.user_id))
    expect(uniqueUsers.size).toBe(150)
  })
})

// ── 1.4 — Weekly recap zero-activity suppression ─────────────────────────────
describe('Phase 1.4 — weekly recap suppresses zero-activity users', () => {
  function recapSupabase({ users, xpRows = [], lessonRows = [], inserts }: {
    users: Array<Record<string, unknown>>
    xpRows?: Array<Record<string, unknown>>
    lessonRows?: Array<Record<string, unknown>>
    inserts: Array<Record<string, unknown>>
  }) {
    return {
      from: (table: string) => {
        if (table === 'users') return usersBuilder(users)
        if (table === 'xp_events') return { select: () => ({ in: () => ({ gte: async () => ({ data: xpRows, error: null }) }) }) }
        if (table === 'user_lesson_progress') return { select: () => ({ in: () => ({ eq: () => ({ gte: async () => ({ data: lessonRows, error: null }) }) }) }) }
        if (table === 'user_notification_preferences') return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
        if (table === 'email_suppressions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
        if (table === 'email_queue') {
          return { insert: (obj: Record<string, unknown>) => { inserts.push(obj); return { select: () => ({ single: async () => ({ data: { id: `q-${inserts.length}` }, error: null }) }) } } }
        }
        if (table === 'notification_events') return { insert: async () => ({ data: null, error: null }) }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      },
    }
  }

  it('an active user with recap data receives the recap; a zero-activity user does not', async () => {
    const inserts: Array<Record<string, unknown>> = []
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      recapSupabase({
        users: [
          { id: 'u-0001', email: 'active@example.com', name: 'Active', total_xp: 500, current_streak: 3 },
          { id: 'u-0002', email: 'idle@example.com', name: 'Idle', total_xp: 0, current_streak: 0 },
        ],
        xpRows: [{ user_id: 'u-0001', xp_amount: 120 }],
        lessonRows: [{ user_id: 'u-0001' }],
        inserts,
      }) as never
    )
    const res = await handleWeeklyRecap(new Request('http://localhost/api/cron/weekly-recap?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.recapsQueued).toBe(1)
    expect(body.recapsSkippedNoActivity).toBe(1)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].user_id).toBe('u-0001')
  })
})

// ── 1.5 — Lifecycle segmentation (pure predicates) ───────────────────────────
describe('Phase 1.5 — lifecycle sequence segmentation', () => {
  const now = new Date('2026-09-26T00:00:00.000Z')
  const baseSnap: LifecycleUserSnapshot = {
    createdAt: now.toISOString(),
    currentStreak: 0,
    longestStreak: 0,
    lastStreakDate: null,
    hasAnyProgress: false,
    hasCompletedLesson: false,
    localDate: '2026-09-26',
  }
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()

  it('D+1: signed up ~1 day ago with no progress qualifies; with progress does not', () => {
    const neverStarted = { ...baseSnap, createdAt: daysAgo(1.5) }
    expect(qualifiesD1NeverStarted(neverStarted, now)).toBe(true)
    expect(resolveLifecycleSequence(neverStarted, now)).toBe('lifecycle.d1_never_started')

    const started = { ...neverStarted, hasAnyProgress: true }
    expect(qualifiesD1NeverStarted(started, now)).toBe(false)

    const tooNew = { ...baseSnap, createdAt: daysAgo(0.5) }
    expect(qualifiesD1NeverStarted(tooNew, now)).toBe(false)
    const tooOld = { ...baseSnap, createdAt: daysAgo(5) }
    expect(qualifiesD1NeverStarted(tooOld, now)).toBe(false)
  })

  it('D+3: started but not finished qualifies; completed first milestone does not', () => {
    const stalled = { ...baseSnap, createdAt: daysAgo(3.5), hasAnyProgress: true, hasCompletedLesson: false }
    expect(qualifiesD3StartedNotFinished(stalled, now)).toBe(true)
    expect(resolveLifecycleSequence(stalled, now)).toBe('lifecycle.d3_started_not_finished')

    const finished = { ...stalled, hasCompletedLesson: true }
    expect(qualifiesD3StartedNotFinished(finished, now)).toBe(false)

    const neverStarted = { ...baseSnap, createdAt: daysAgo(3.5), hasAnyProgress: false }
    expect(qualifiesD3StartedNotFinished(neverStarted, now)).toBe(false)
  })

  it('streak-broken: previously-active learner gone quiet qualifies; active/never-streaked do not', () => {
    const broken = { ...baseSnap, createdAt: daysAgo(20), currentStreak: 0, longestStreak: 5, lastStreakDate: '2026-09-23' }
    expect(qualifiesStreakBroken(broken)).toBe(true)
    expect(resolveLifecycleSequence(broken, now)).toBe('lifecycle.streak_broken')

    // Still on a streak → no
    expect(qualifiesStreakBroken({ ...broken, currentStreak: 4 })).toBe(false)
    // Never built a habit → no
    expect(qualifiesStreakBroken({ ...broken, longestStreak: 1 })).toBe(false)
    // Only quiet for 1 day (still inside the daily-reminder window) → no
    expect(qualifiesStreakBroken({ ...broken, lastStreakDate: '2026-09-25' })).toBe(false)
    // Quiet far beyond the window → no (owned by later/other lifecycle logic, not this daily fire)
    expect(qualifiesStreakBroken({ ...broken, lastStreakDate: '2026-09-01' })).toBe(false)
  })

  it('a fully-active learner matches no sequence', () => {
    const active = { ...baseSnap, createdAt: daysAgo(30), currentStreak: 6, longestStreak: 6, lastStreakDate: '2026-09-26', hasAnyProgress: true, hasCompletedLesson: true }
    expect(resolveLifecycleSequence(active, now)).toBeNull()
  })

  it('daysBetweenLocalDates computes whole-day gaps', () => {
    expect(daysBetweenLocalDates('2026-09-26', '2026-09-23')).toBe(3)
    expect(daysBetweenLocalDates('2026-09-26', '2026-09-26')).toBe(0)
    expect(daysBetweenLocalDates('bad', '2026-09-26')).toBeNull()
  })
})

// ── Step 8 — Deterministic 30% holdout ───────────────────────────────────────
describe('Phase 1 Step 8 — deterministic lifecycle holdout', () => {
  it('is deterministic and stable for a (user, sequence) pair across calls', () => {
    const a = isLifecycleHoldout('user-xyz', 'lifecycle.d1_never_started')
    const b = isLifecycleHoldout('user-xyz', 'lifecycle.d1_never_started')
    expect(a).toBe(b)
    expect(lifecycleBucket('user-xyz', 'lifecycle.d1_never_started')).toBe(
      lifecycleBucket('user-xyz', 'lifecycle.d1_never_started')
    )
  })

  it('holds out approximately 30% across a large deterministic sample', () => {
    const N = 5000
    let held = 0
    for (let i = 0; i < N; i++) {
      if (isLifecycleHoldout(`user-${i}`, 'lifecycle.d1_never_started')) held++
    }
    const pct = (held / N) * 100
    expect(pct).toBeGreaterThan(26)
    expect(pct).toBeLessThan(34)
    expect(DEFAULT_LIFECYCLE_HOLDOUT_PERCENT).toBe(30)
  })

  it('0% holds out no one; 100% holds out everyone', () => {
    expect(isLifecycleHoldout('anyone', 'lifecycle.d1_never_started', 0)).toBe(false)
    expect(isLifecycleHoldout('anyone', 'lifecycle.d1_never_started', 100)).toBe(true)
  })

  it('buckets independently per sequence key', () => {
    // Different salts should not force the same bucket for a given user.
    const buckets = new Set([
      lifecycleBucket('user-42', 'lifecycle.d1_never_started'),
      lifecycleBucket('user-42', 'lifecycle.d3_started_not_finished'),
      lifecycleBucket('user-42', 'lifecycle.streak_broken'),
    ])
    // Extremely unlikely (but not impossible) for all three to collide; assert at least
    // two distinct buckets to prove the sequence key participates in the hash.
    expect(buckets.size).toBeGreaterThanOrEqual(2)
  })
})

// ── 1.5 + Step 8 — Lifecycle cron integration ────────────────────────────────
describe('Phase 1.5 — lifecycle cron treats ~70% and holds out ~30%, no duplicates', () => {
  function lifecycleSupabase({ users, progressRows = [], inserts, holdoutEvents }: {
    users: Array<Record<string, unknown>>
    progressRows?: Array<Record<string, unknown>>
    inserts: Array<Record<string, unknown>>
    holdoutEvents: Array<Record<string, unknown>>
  }) {
    return {
      from: (table: string) => {
        if (table === 'users') return usersBuilder(users)
        if (table === 'user_lesson_progress') return { select: () => ({ in: async () => ({ data: progressRows, error: null }) }) }
        if (table === 'user_notification_preferences') return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
        if (table === 'email_suppressions') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
        if (table === 'email_queue') {
          return { insert: (obj: Record<string, unknown>) => { inserts.push(obj); return { select: () => ({ single: async () => ({ data: { id: `q-${inserts.length}` }, error: null }) }) } } }
        }
        if (table === 'notification_events') {
          return {
            insert: async (obj: Record<string, unknown>) => {
              if (typeof obj?.skipped_reason === 'string' && obj.skipped_reason.startsWith('lifecycle_holdout')) {
                holdoutEvents.push(obj)
              }
              return { data: null, error: null }
            },
          }
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
      },
    }
  }

  it('D+1 never-started cohort: ~70% queued, ~30% held out, all classified, no dup', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const holdoutEvents: Array<Record<string, unknown>> = []
    // 200 users who signed up ~1.5 days ago, none with any progress → all D+1 eligible.
    const created = new Date(Date.now() - 1.5 * 86400000).toISOString()
    const users = Array.from({ length: 200 }, (_, i) => ({
      id: `u-${String(i).padStart(4, '0')}`,
      email: `new${i}@example.com`,
      name: `New ${i}`,
      created_at: created,
      current_streak: 0,
      longest_streak: 0,
      last_streak_date: null,
      timezone: 'UTC',
    }))
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      lifecycleSupabase({ users, progressRows: [], inserts, holdoutEvents }) as never
    )

    const res = await handleLifecycle(new Request('http://localhost/api/cron/lifecycle?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()

    // Everyone is classified into exactly one sequence: treated + held out = 200
    expect(body.lifecycleQueued + body.heldOut).toBe(200)
    expect(body.skippedNoSegment).toBe(0)
    // Treatment is roughly 70%
    expect(body.lifecycleQueued).toBeGreaterThan(120)
    expect(body.lifecycleQueued).toBeLessThan(160)
    // All treated emails are the D+1 sequence
    expect(body.queuedBySequence['lifecycle.d1_never_started']).toBe(body.lifecycleQueued)
    // Every enqueued row uses the D+1 template and there are no duplicate users
    expect(inserts.every((i) => i.template_key === 'lifecycle.d1_never_started')).toBe(true)
    expect(new Set(inserts.map((i) => i.user_id)).size).toBe(inserts.length)
    // Holdout users were recorded for measurement
    expect(holdoutEvents).toHaveLength(body.heldOut)
  })

  it('re-running the lifecycle cron does not re-classify already-started users (idempotent segmentation)', async () => {
    const inserts: Array<Record<string, unknown>> = []
    const holdoutEvents: Array<Record<string, unknown>> = []
    // A user who has since completed a lesson no longer qualifies for D+3.
    const created = new Date(Date.now() - 3.5 * 86400000).toISOString()
    const users = [{
      id: 'u-0001', email: 'done@example.com', name: 'Done', created_at: created,
      current_streak: 1, longest_streak: 1, last_streak_date: null, timezone: 'UTC',
    }]
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(
      lifecycleSupabase({ users, progressRows: [{ user_id: 'u-0001', status: 'completed' }], inserts, holdoutEvents }) as never
    )
    const res = await handleLifecycle(new Request('http://localhost/api/cron/lifecycle?force=true', { method: 'POST', headers: CRON_HEADERS }))
    const body = await res.json()
    expect(body.lifecycleQueued).toBe(0)
    expect(body.skippedNoSegment).toBe(1)
    expect(inserts).toHaveLength(0)
  })
})
