import { describe, it, expect, vi, beforeEach } from 'vitest'

// CQ-04: the broadcast and legacy eventId dedupe reads in enqueueNotificationItem used
// `.maybeSingle()` with no limit. Once two matching rows existed the read errored, the
// error was discarded, and the insert queued yet another copy. The eventId branch also
// never filtered by `event_id`.
//
// CQ-13: the batch failure and backlog alerts were `void logSystemError(...)`, which a
// serverless runtime can drop when the invocation ends.

const { db, logMock, logSystemErrorMock, logErrorReportMock } = vi.hoisted(() => ({
  db: {
    emailQueue: [] as Array<Record<string, unknown>>,
    skipped: [] as Array<Record<string, unknown>>,
    /** Forces the next email_queue dedupe read to return this error. */
    readError: null as { message: string } | null,
    /** Rows the claim RPC hands to processEmailQueue. */
    claimRows: [] as Array<Record<string, unknown>>,
    backlogCount: 0,
  },
  logMock: { info: vi.fn(), warn: vi.fn(), warnException: vi.fn(), exception: vi.fn() },
  logSystemErrorMock: vi.fn(),
  logErrorReportMock: vi.fn(async () => null),
}))

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * In-memory `email_queue` that behaves like PostgREST where it matters here:
 * `.maybeSingle()` errors (PGRST116) when more than one row is left after `.limit()`, and
 * filtering the uuid `event_id` column by a non-UUID value errors (22P02).
 */
function emailQueueBuilder() {
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  let limit: number | null = null
  let castError: { code: string; message: string } | null = null
  let countMode = false
  let pendingInsert: Record<string, unknown> | null = null

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.head) countMode = true
      return builder
    },
    eq: (col: string, val: unknown) => {
      if (col === 'event_id' && typeof val === 'string' && !UUID_PATTERN.test(val)) {
        castError = { code: '22P02', message: 'invalid input syntax for type uuid' }
      }
      filters.push((row) => row[col] === val)
      return builder
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((row) => vals.includes(row[col]))
      return builder
    },
    lte: () => builder,
    limit: (n: number) => {
      limit = n
      return builder
    },
    insert: (row: Record<string, unknown>) => {
      pendingInsert = row
      return builder
    },
    maybeSingle: async () => {
      if (db.readError) return { data: null, error: db.readError }
      if (castError) return { data: null, error: castError }
      let rows = db.emailQueue.filter((row) => filters.every((f) => f(row)))
      if (limit !== null) rows = rows.slice(0, limit)
      if (rows.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple rows returned' } }
      }
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      const inserted = { ...(pendingInsert as Record<string, unknown>), id: `q-${db.emailQueue.length + 1}` }
      db.emailQueue.push(inserted)
      return { data: inserted, error: null }
    },
    update: () => builder,
    then: (onfulfilled: (v: unknown) => unknown) =>
      Promise.resolve(countMode ? { data: null, count: db.backlogCount, error: null } : { data: null, error: null }).then(
        onfulfilled
      ),
  }
  return builder
}

/** A chainable builder that resolves to "no row" for every other table. */
function emptyBuilder() {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'lte', 'order', 'limit', 'insert', 'update', 'upsert', 'or']) {
    builder[m] = () => builder
  }
  builder.single = async () => ({ data: null, error: null })
  builder.maybeSingle = async () => ({ data: null, error: null })
  builder.then = (onfulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(onfulfilled)
  return builder
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'email_queue') return emailQueueBuilder()
      if (table === 'notification_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            db.skipped.push(row)
            return { error: null }
          },
        }
      }
      return emptyBuilder()
    },
    rpc: async (name: string) => {
      if (name === 'reclaim_stale_processing_items') return { data: [], error: null }
      if (name === 'claim_email_queue_items') return { data: db.claimRows, error: null }
      if (name === 'increment_daily_email_quota') return { data: true, error: null }
      return { data: null, error: null }
    },
  }),
}))

vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    isEnabledAsync: vi.fn(async () => true),
  },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100000 })),
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
  },
}))

vi.mock('@/lib/notifications/preferences/defaults', () => ({
  isChannelEnabledByPreferences: vi.fn(() => true),
  getResolvedUserNotificationPreferences: vi.fn(async () => ({})),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: { getEmailSettings: vi.fn(async () => ({ retryDelayMinutes: 5 })) },
}))

vi.mock('@/emails', () => ({
  renderEmailTemplate: vi.fn(async () => {
    throw new Error('template missing')
  }),
}))

vi.mock('@/lib/monitoring/log', () => ({ log: logMock }))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: logSystemErrorMock,
  logErrorReport: logErrorReportMock,
}))

import { enqueueNotificationItem, processEmailQueue } from '../notifications/queue/processor'

const EVENT_UUID = '7f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const OTHER_UUID = '0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d'

function baseParams(overrides: Partial<Parameters<typeof enqueueNotificationItem>[0]> = {}) {
  return {
    userId: 'u-1',
    toEmail: 'learner@example.com',
    channel: 'email' as const,
    templateKey: 'learning.module_complete',
    templateVariables: { userName: 'Learner' },
    eventType: 'module.completed',
    category: 'learning' as const,
    priorityLevel: 'medium' as const,
    ...overrides,
  }
}

function queuedRow(overrides: Record<string, unknown>) {
  return {
    user_id: 'u-1',
    template_key: 'learning.module_complete',
    event_type: 'module.completed',
    status: 'delivered',
    event_id: null,
    broadcast_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  db.emailQueue.length = 0
  db.skipped.length = 0
  db.readError = null
  db.claimRows = []
  db.backlogCount = 0
  vi.clearAllMocks()
  logSystemErrorMock.mockImplementation(async () => null)
})

describe('CQ-04: broadcast dedupe survives two or more existing rows', () => {
  it('reports a duplicate instead of inserting a third copy', async () => {
    db.emailQueue.push(
      queuedRow({ id: 'q-a', broadcast_id: 'b-1' }),
      queuedRow({ id: 'q-b', broadcast_id: 'b-1' })
    )

    const result = await enqueueNotificationItem(baseParams({ broadcastId: 'b-1' }))

    expect(result).toMatchObject({ success: false, duplicate: true, queueId: 'q-a' })
    expect(db.emailQueue).toHaveLength(2)
    expect(db.skipped.map((r) => r.skipped_reason)).toEqual(['duplicate_broadcast_user'])
  })

  it('still queues the first copy for a broadcast', async () => {
    const result = await enqueueNotificationItem(baseParams({ broadcastId: 'b-1' }))

    expect(result.success).toBe(true)
    expect(db.emailQueue).toHaveLength(1)
    expect(db.emailQueue[0].broadcast_id).toBe('b-1')
  })
})

describe('CQ-04: legacy eventId dedupe', () => {
  it('a UUID event id that is already queued twice is a duplicate, not a third insert', async () => {
    db.emailQueue.push(
      queuedRow({ id: 'q-a', event_id: EVENT_UUID }),
      queuedRow({ id: 'q-b', event_id: EVENT_UUID, status: 'pending' })
    )

    const result = await enqueueNotificationItem(baseParams({ eventId: EVENT_UUID }))

    expect(result).toMatchObject({ success: false, duplicate: true })
    expect(db.emailQueue).toHaveLength(2)
    expect(db.skipped.map((r) => r.skipped_reason)).toEqual(['duplicate_event_id'])
  })

  it('a UUID event id is matched on event_id, so a different event for the same template still sends', async () => {
    db.emailQueue.push(queuedRow({ id: 'q-a', event_id: OTHER_UUID }))

    const result = await enqueueNotificationItem(baseParams({ eventId: EVENT_UUID }))

    expect(result.success).toBe(true)
    expect(db.emailQueue).toHaveLength(2)
    expect(db.emailQueue[1].event_id).toBe(EVENT_UUID)
  })

  it('a non-UUID event id never filters the uuid column and still dedupes with two existing rows', async () => {
    db.emailQueue.push(queuedRow({ id: 'q-a' }), queuedRow({ id: 'q-b' }))

    const result = await enqueueNotificationItem(baseParams({ eventId: 'badge-u-1-first_lesson' }))

    expect(result).toMatchObject({ success: false, duplicate: true, queueId: 'q-a' })
    expect(db.emailQueue).toHaveLength(2)
    expect(logMock.warn).not.toHaveBeenCalled()
  })

  it('a non-UUID event id is stored with a null event_id', async () => {
    const result = await enqueueNotificationItem(baseParams({ eventId: 'badge-u-1-first_lesson' }))

    expect(result.success).toBe(true)
    expect(db.emailQueue[0].event_id).toBeNull()
  })

  it('a failed dedupe read is logged, not silently discarded', async () => {
    db.readError = { message: 'statement timeout' }

    const result = await enqueueNotificationItem(baseParams({ eventId: EVENT_UUID }))

    expect(logMock.warn).toHaveBeenCalledWith(
      'queue.dedupe_read_failed',
      expect.objectContaining({ branch: 'event', reason: 'statement timeout' })
    )
    // Documented behaviour: the read is best-effort, so the insert still runs.
    expect(result.success).toBe(true)
  })
})

describe('CQ-13: queue alerts are awaited', () => {
  /** A logSystemError that only finishes on a later tick, so an un-awaited call is detectable. */
  function slowLogger() {
    const state = { finished: false }
    logSystemErrorMock.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => {
            state.finished = true
            resolve(null)
          }, 20)
        )
    )
    return state
  }

  it('the repeated-provider-failure alert has finished before processEmailQueue returns', async () => {
    db.claimRows = Array.from({ length: 5 }, (_, i) => ({
      id: `q-${i}`,
      user_id: 'u-1',
      to_email: 'learner@example.com',
      template_key: 'learning.module_complete',
      template_variables: {},
      attempt_count: 1,
      max_attempts: 3,
    }))
    const state = slowLogger()

    const result = await processEmailQueue(5)

    expect(result.failed).toBe(5)
    expect(logSystemErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'email.repeated_provider_failures' })
    )
    expect(state.finished).toBe(true)
  })

  it('the backlog-growth alert has finished before a multi-batch drain returns', async () => {
    db.backlogCount = 500
    const state = slowLogger()

    await processEmailQueue(5, { maxBatches: 2 })

    expect(logSystemErrorMock).toHaveBeenCalledWith(expect.objectContaining({ operation: 'queue_backlog_growth' }))
    expect(state.finished).toBe(true)
  })
})
