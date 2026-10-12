import { describe, it, expect, vi, beforeEach } from 'vitest'

// Growth R5 review fixes in the lifecycle cron:
// - a learner whose lifecycle email for today is a duplicate (an earlier run sent it) is not
//   nudged on top of it; only a genuine skip (preference, toggle, suppression) makes them a
//   nudge candidate;
// - a dry run writes nothing at all: no lifecycle email, no holdout record, no nudge.

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  runNudges: vi.fn(),
  holdout: vi.fn(),
  inserts: [] as Array<Record<string, unknown>>,
  usersError: null as { message: string } | null,
  progressRows: [] as Array<{ user_id: string; status: string }>,
  progressError: null as { message: string } | null,
  logSystemError: vi.fn(),
  prefs: vi.fn(),
}))

vi.mock('@/lib/monitoring/logger', () => ({ logSystemError: mocks.logSystemError }))

vi.mock('@/lib/notifications/queue/processor', () => ({ enqueueNotificationItem: mocks.enqueue }))
vi.mock('@/lib/growth/proof-nudges-run', () => ({ runProofNudgesForPage: mocks.runNudges }))
vi.mock('@/lib/growth/proof-state-db', () => ({ loadProofStates: vi.fn(async () => new Map()) }))
vi.mock('@/lib/notifications/lifecycle/holdout', () => ({ isLifecycleHoldout: mocks.holdout }))
vi.mock('@/lib/notifications/preferences/defaults', () => ({ getBatchUserNotificationPreferences: mocks.prefs }))
vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isGlobalPauseActive: vi.fn(async () => false),
    getDigestSchedules: vi.fn(async () => ({ dailyReminder: { hourUtc: 9 } })),
  },
}))
vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => fakeSupabase() }
})

/** Two D+1 users (signed up ~1.5 days ago, no progress). */
const USERS = ['u-1', 'u-2'].map((id) => ({
  id,
  email: `${id}@example.com`,
  name: id,
  created_at: new Date(Date.now() - 1.5 * 86400000).toISOString(),
  current_streak: 0,
  longest_streak: 0,
  last_streak_date: null,
  timezone: 'UTC',
}))

/**
 * `user_lesson_progress` as PostgREST serves it: a response never holds more than 1000 rows
 * (max_rows), with or without `.range()`, and only an ordered query pages deterministically.
 */
const MAX_ROWS = 1000
function progressBuilder() {
  let range: [number, number] | null = null
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.in = () => b
  b.order = () => b
  b.range = (from: number, to: number) => {
    range = [from, to]
    return b
  }
  b.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
    const [from, to] = range ?? [0, MAX_ROWS - 1]
    const result = mocks.progressError
      ? { data: null, error: mocks.progressError }
      : { data: mocks.progressRows.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }
    return Promise.resolve(result).then(resolve, reject)
  }
  return b
}

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === 'users') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.not = () => b
        b.gt = () => b
        b.order = () => b
        b.limit = async () => (mocks.usersError ? { data: null, error: mocks.usersError } : { data: USERS, error: null })
        return b
      }
      if (table === 'user_lesson_progress') return progressBuilder()
      if (table === 'notification_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            mocks.inserts.push(row)
            return { error: null }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

import { POST } from '../../app/api/cron/lifecycle/route'

const run = (query: string) =>
  POST(
    new Request(`http://localhost/api/cron/lifecycle?force=true${query}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }),
  )

const nudgeCandidateIds = () => (mocks.runNudges.mock.calls[0]?.[1] as Array<{ id: string }> | undefined)?.map((c) => c.id) ?? []

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret'
  mocks.inserts = []
  mocks.usersError = null
  mocks.progressRows = []
  mocks.progressError = null
  mocks.logSystemError.mockReset()
  mocks.prefs.mockReset().mockResolvedValue(new Map())
  mocks.enqueue.mockReset()
  mocks.holdout.mockReset().mockReturnValue(false)
  mocks.runNudges.mockReset().mockResolvedValue({ sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 }, heldOut: 0, skipped: false })
})

describe('lifecycle cron → proof nudge routing', () => {
  it('does not nudge a learner whose lifecycle email is a duplicate, but does after a genuine skip', async () => {
    mocks.enqueue
      .mockResolvedValueOnce({ success: false, duplicate: true, reason: 'Duplicate notification event already queued or delivered' })
      .mockResolvedValueOnce({ success: false, reason: 'User preference disabled' })

    await run('')

    expect(nudgeCandidateIds()).toEqual(['u-2'])
  })

  it('a dry run sends no lifecycle email, records no holdout and dry-runs the nudges', async () => {
    mocks.holdout.mockImplementation((userId: string) => userId === 'u-2')

    const body = await (await run('&dryRun=true')).json()

    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.inserts).toEqual([])
    expect(body).toMatchObject({ dryRun: true, lifecycleQueued: 1, heldOut: 1 })
    expect(mocks.runNudges.mock.calls[0][2]).toMatchObject({ dryRun: true })
    // The held-out learner is still evaluated for a nudge (in dry-run mode).
    expect(nudgeCandidateIds()).toEqual(['u-2'])
  })

  it('logs a failed run under the cron operation names', async () => {
    mocks.usersError = { message: 'users unavailable' }

    const res = await run('')

    expect(res.status).toBe(200)
    expect(mocks.logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'cron_lifecycle_query',
        message: 'Database query failure in /api/cron/lifecycle: users unavailable',
      })
    )
  })

  it('keeps the cron console prefix', async () => {
    mocks.enqueue.mockResolvedValue({ success: false, reason: 'User preference disabled' })
    mocks.runNudges.mockRejectedValue(new Error('nudges down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await run('')

    expect(error).toHaveBeenCalledWith('[cron/lifecycle] Proof nudges failed for a page:', expect.any(Error))
    error.mockRestore()
  })

  it('accepts the older nudgeDryRun parameter', async () => {
    const body = await (await run('&nudgeDryRun=true')).json()
    expect(body.dryRun).toBe(true)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})

// A page of learners can own more progress rows than one response holds (1000). The read is
// paged, and a failed read skips the page instead of treating everyone as never started.
describe('lifecycle cron → learning progress read', () => {
  /** u-1 fills the first response on their own; u-2's single row sorts after it. */
  const overCap = () => [
    ...Array.from({ length: MAX_ROWS }, () => ({ user_id: 'u-1', status: 'in_progress' })),
    { user_id: 'u-2', status: 'in_progress' },
  ]

  it('still sees the progress of a learner whose rows fall past the first 1000', async () => {
    mocks.progressRows = overCap()

    const body = await (await run('')).json()

    // Neither learner is "never started", so no D+1 email; both go on to the nudges.
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(body).toMatchObject({ lifecycleQueued: 0, skippedNoSegment: 2 })
    expect(nudgeCandidateIds()).toEqual(['u-1', 'u-2'])
  })

  it('skips the page when the progress read fails: no email, no holdout, no nudge', async () => {
    mocks.progressError = { message: 'progress unavailable' }
    mocks.holdout.mockImplementation((userId: string) => userId === 'u-2')

    const res = await run('')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.inserts).toEqual([])
    expect(mocks.runNudges).not.toHaveBeenCalled()
    expect(body).toMatchObject({ lifecycleQueued: 0, heldOut: 0, skippedNoSegment: 0 })
    // The whole page was skipped (lifecycle emails too), so it is reported at the top level; the
    // nudge counter keeps counting it as before.
    expect(body.pagesSkipped).toBe(1)
    expect(body.proofNudges.pagesSkipped).toBe(1)
    expect(mocks.logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'cron_lifecycle_progress_query',
        message: 'Learning progress read failed in /api/cron/lifecycle; page skipped: progress unavailable',
      })
    )
  })

  // A failed preferences read used to fall back to "everyone opted in", so an opted-out learner
  // got the email. The read is strict here and a failure skips the page until the next run.
  it('skips the page when the preferences read fails: no email, no holdout, no nudge', async () => {
    mocks.prefs.mockRejectedValue(new Error('preferences unavailable'))
    mocks.holdout.mockImplementation((userId: string) => userId === 'u-2')

    const res = await run('')
    const body = await res.json()

    expect(mocks.prefs).toHaveBeenCalledWith(expect.anything(), ['u-1', 'u-2'], { strict: true })
    expect(res.status).toBe(200)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.inserts).toEqual([])
    expect(mocks.runNudges).not.toHaveBeenCalled()
    expect(body).toMatchObject({ lifecycleQueued: 0, heldOut: 0, skippedNoSegment: 0 })
    expect(body.pagesSkipped).toBe(1)
    expect(body.proofNudges.pagesSkipped).toBe(1)
    expect(mocks.logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'cron_lifecycle_preferences_query',
        message: 'Notification preferences read failed in /api/cron/lifecycle; page skipped: preferences unavailable',
      })
    )
  })

  it('shares one set of nudge toggles across the run and reports learners whose nudge failed', async () => {
    mocks.progressRows = overCap()
    mocks.runNudges.mockResolvedValue({ sent: { 'nudge.portfolio_ready': 1, 'nudge.fellow_eligible': 0 }, heldOut: 0, skipped: false, failed: 2 })

    await run('')

    expect(mocks.runNudges.mock.calls[0][2].enabled).toBeInstanceOf(Map)
    expect(mocks.logSystemError).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'cron_lifecycle_proof_nudges',
        message: 'Proof nudges failed for 2 learner(s) in /api/cron/lifecycle; they are retried on the next run',
      })
    )
  })

  // A page whose nudges alone could not be evaluated still had its lifecycle emails sent.
  it('does not count a page as skipped when only its nudges could not be evaluated', async () => {
    mocks.enqueue.mockResolvedValue({ success: true })
    mocks.runNudges.mockResolvedValue({ sent: { 'nudge.portfolio_ready': 0, 'nudge.fellow_eligible': 0 }, heldOut: 0, skipped: true, failed: 0 })

    const body = await (await run('')).json()

    expect(body).toMatchObject({ lifecycleQueued: 2, pagesSkipped: 0 })
    expect(body.proofNudges.pagesSkipped).toBe(1)
  })

  it('a dry run over a page past the cap counts the same and writes nothing', async () => {
    mocks.progressRows = overCap()

    const body = await (await run('&dryRun=true')).json()

    expect(body).toMatchObject({ dryRun: true, lifecycleQueued: 0, skippedNoSegment: 2 })
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.inserts).toEqual([])
    expect(mocks.runNudges.mock.calls[0][2]).toMatchObject({ dryRun: true })
  })
})
