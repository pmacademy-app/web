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
}))

vi.mock('@/lib/notifications/queue/processor', () => ({ enqueueNotificationItem: mocks.enqueue }))
vi.mock('@/lib/growth/proof-nudges-run', () => ({ runProofNudgesForPage: mocks.runNudges }))
vi.mock('@/lib/growth/proof-state-db', () => ({ loadProofStates: vi.fn(async () => new Map()) }))
vi.mock('@/lib/notifications/lifecycle/holdout', () => ({ isLifecycleHoldout: mocks.holdout }))
vi.mock('@/lib/notifications/preferences/defaults', () => ({ getBatchUserNotificationPreferences: vi.fn(async () => new Map()) }))
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

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === 'users') {
        const b: Record<string, unknown> = {}
        b.select = () => b
        b.not = () => b
        b.gt = () => b
        b.order = () => b
        b.limit = async () => ({ data: USERS, error: null })
        return b
      }
      if (table === 'user_lesson_progress') return { select: () => ({ in: async () => ({ data: [], error: null }) }) }
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

  it('accepts the older nudgeDryRun parameter', async () => {
    const body = await (await run('&nudgeDryRun=true')).json()
    expect(body.dryRun).toBe(true)
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
