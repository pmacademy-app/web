import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Admin R6 C2: the admin lifecycle preview runs the cron's evaluation as a dry run. It must
// write nothing (no enqueue, no insert, no update) and report the lifecycle and nudge counts.

const mocks = vi.hoisted(() => ({
  requireAdminUser: vi.fn(),
  enqueue: vi.fn(),
  runNudges: vi.fn(),
  holdout: vi.fn(),
  isGlobalPause: vi.fn(),
  writes: [] as Array<{ table: string; op: string }>,
  usersError: null as { message: string } | null,
  logSystemError: vi.fn(),
  buckets: new Map<string, number>(),
}))

// A per-key counter standing in for the persistent limiter, reset before each test.
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async (key: string, opts: { limit: number; windowMs: number }) => {
    const used = (mocks.buckets.get(key) ?? 0) + 1
    mocks.buckets.set(key, used)
    return { success: used <= opts.limit, remaining: Math.max(0, opts.limit - used), resetInMs: opts.windowMs }
  }),
}))
vi.mock('@/lib/monitoring/logger', () => ({ logSystemError: mocks.logSystemError }))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => mocks.requireAdminUser(req),
  logAdminAction: vi.fn(),
}))
vi.mock('@/lib/notifications/queue/processor', () => ({ enqueueNotificationItem: mocks.enqueue }))
vi.mock('@/lib/growth/proof-nudges-run', () => ({ runProofNudgesForPage: mocks.runNudges }))
vi.mock('@/lib/growth/proof-state-db', () => ({ loadProofStates: vi.fn(async () => new Map()) }))
vi.mock('@/lib/notifications/lifecycle/holdout', () => ({ isLifecycleHoldout: mocks.holdout }))
vi.mock('@/lib/notifications/preferences/defaults', () => ({ getBatchUserNotificationPreferences: vi.fn(async () => new Map()) }))
vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isGlobalPauseActive: () => mocks.isGlobalPause(),
    getDigestSchedules: vi.fn(async () => ({ dailyReminder: { hourUtc: 9 } })),
  },
}))
vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => fakeSupabase() }
})

/** Three D+1 users (signed up ~1.5 days ago, no progress). */
const USERS = ['u-1', 'u-2', 'u-3'].map((id) => ({
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
  const recordWrite = (table: string, op: string) => async () => {
    mocks.writes.push({ table, op })
    return { error: null }
  }
  return {
    from(table: string) {
      const writes = {
        insert: recordWrite(table, 'insert'),
        update: recordWrite(table, 'update'),
        upsert: recordWrite(table, 'upsert'),
        delete: recordWrite(table, 'delete'),
      }
      if (table === 'users') {
        const b: Record<string, unknown> = { ...writes }
        b.select = () => b
        b.not = () => b
        b.gt = () => b
        b.order = () => b
        b.limit = async () => (mocks.usersError ? { data: null, error: mocks.usersError } : { data: USERS, error: null })
        return b
      }
      if (table === 'user_lesson_progress') return { ...writes, select: () => ({ in: async () => ({ data: [], error: null }) }) }
      return writes
    },
  }
}

const { POST } = await import('../../app/api/admin/automations/lifecycle-preview/route')

const ADMIN = { authorized: true, userId: 'admin-1', email: 'admin@prodily.app' }

const preview = (query = '?force=true') =>
  POST(new NextRequest(`https://prodily.app/api/admin/automations/lifecycle-preview${query}`, { method: 'POST' }), {
    params: Promise.resolve({}),
  })

beforeEach(() => {
  mocks.writes = []
  mocks.usersError = null
  mocks.buckets.clear()
  mocks.logSystemError.mockReset()
  mocks.requireAdminUser.mockReset().mockResolvedValue(ADMIN)
  mocks.enqueue.mockReset()
  mocks.isGlobalPause.mockReset().mockResolvedValue(false)
  mocks.holdout.mockReset().mockImplementation((userId: string) => userId === 'u-3')
  mocks.runNudges
    .mockReset()
    .mockResolvedValue({ sent: { 'nudge.portfolio_ready': 2, 'nudge.fellow_eligible': 1 }, heldOut: 1, skipped: false })
})

describe('POST /api/admin/automations/lifecycle-preview', () => {
  it('reports lifecycle, holdout and per-key nudge counts without writing anything', async () => {
    const res = await preview()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      force: true,
      paused: false,
      lifecycleQueued: 2,
      heldOut: 1,
      queuedBySequence: { 'lifecycle.d1_never_started': 2 },
      nudges: { 'nudge.portfolio_ready': 2, 'nudge.fellow_eligible': 1 },
      nudgesHeldOut: 1,
    })
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.writes).toEqual([])
    expect(mocks.runNudges.mock.calls[0][2]).toMatchObject({ dryRun: true })
  })

  it('always dry-runs, even when the caller asks otherwise', async () => {
    const body = await (await preview('?force=true&dryRun=false')).json()

    expect(body.dryRun).toBe(true)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.writes).toEqual([])
  })

  it('reports a paused run with zero counts', async () => {
    mocks.isGlobalPause.mockResolvedValue(true)

    const body = await (await preview()).json()

    expect(body).toMatchObject({ paused: true, lifecycleQueued: 0, heldOut: 0 })
    expect(mocks.runNudges).not.toHaveBeenCalled()
  })

  it('refuses a non-admin with 403 and runs nothing', async () => {
    mocks.requireAdminUser.mockResolvedValue({ authorized: false, error: 'Access denied', statusCode: 403 })

    const res = await preview()

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('FORBIDDEN')
    expect(mocks.runNudges).not.toHaveBeenCalled()
  })

  it('allows two previews per admin per minute, then answers 429 without running', async () => {
    expect((await preview()).status).toBe(200)
    expect((await preview()).status).toBe(200)
    const third = await preview()

    expect(third.status).toBe(429)
    expect((await third.json()).code).toBe('RATE_LIMITED')
    expect(mocks.runNudges).toHaveBeenCalledTimes(2)

    // The bucket is per admin: another admin is not throttled by the first one.
    mocks.requireAdminUser.mockResolvedValue({ ...ADMIN, userId: 'admin-2' })
    expect((await preview()).status).toBe(200)
  })

  it('logs a failed preview as the admin preview, not as the cron', async () => {
    mocks.usersError = { message: 'users unavailable' }

    expect((await preview()).status).toBe(200)

    expect(mocks.logSystemError).toHaveBeenCalledTimes(1)
    const entry = mocks.logSystemError.mock.calls[0][0]
    expect(entry.operation).toBe('admin_lifecycle_preview_query')
    expect(entry.message).toContain('/api/admin/automations/lifecycle-preview')
    expect(entry.message).not.toContain('/api/cron/lifecycle')
  })

  it('refuses the cron secret: the preview is admin only', async () => {
    process.env.CRON_SECRET = 'test-cron-secret'
    mocks.requireAdminUser.mockResolvedValue({ authorized: false, error: 'Authentication required', statusCode: 401 })

    const res = await POST(
      new NextRequest('https://prodily.app/api/admin/automations/lifecycle-preview', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-cron-secret' },
      }),
      { params: Promise.resolve({}) },
    )

    expect([401, 403]).toContain(res.status)
    expect(mocks.runNudges).not.toHaveBeenCalled()
  })
})
