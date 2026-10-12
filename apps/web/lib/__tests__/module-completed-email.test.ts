/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The `module.completed` email (`learning.module_complete`).
 *
 * `module.completed` fires once per learner per module under a stable event id
 * (module-completion.test.ts). The email must follow it: one per module, none for a replay.
 * Without an idempotency key the queue's fallback lookup is (user, template, event type), so the
 * first module's email suppressed every later module's.
 *
 * The connector runs against the real `enqueueNotificationItem` here, over an in-memory
 * `email_queue` that enforces the unique idempotency-key index.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enqueueSpy, createInAppSpy, db } = vi.hoisted(() => ({
  enqueueSpy: vi.fn(),
  createInAppSpy: vi.fn(),
  db: {
    emailQueue: [] as Record<string, any>[],
    skipped: [] as Record<string, any>[],
  },
}))

/** A chainable builder that resolves to "no row" for every table the enqueue path only reads. */
function emptyBuilder() {
  const builder: Record<string, any> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'upsert']) {
    builder[m] = vi.fn(() => builder)
  }
  builder.single = vi.fn(async () => ({ data: null, error: null }))
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  builder.then = (onfulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(onfulfilled)
  return builder
}

/** `email_queue`: filtered reads, and inserts that honour the unique partial index on the key. */
function emailQueueBuilder() {
  const filters: Array<(row: Record<string, any>) => boolean> = []
  let pendingInsert: Record<string, any> | null = null
  const builder: Record<string, any> = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filters.push((row) => row[col] === val)
      return builder
    },
    in: (col: string, vals: unknown[]) => {
      filters.push((row) => vals.includes(row[col]))
      return builder
    },
    insert: (row: Record<string, any>) => {
      pendingInsert = row
      return builder
    },
    maybeSingle: async () => {
      const rows = db.emailQueue.filter((row) => filters.every((f) => f(row)))
      if (rows.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      return { data: rows[0] ?? null, error: null }
    },
    single: async () => {
      const row = pendingInsert as Record<string, any>
      if (row.idempotency_key && db.emailQueue.some((r) => r.idempotency_key === row.idempotency_key)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
      }
      const stored = { ...row, id: `q-${db.emailQueue.length + 1}` }
      db.emailQueue.push(stored)
      return { data: { id: stored.id }, error: null }
    },
  }
  return builder
}

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createServiceRoleClient: () => ({
      from: (table: string) => {
        if (table === 'email_queue') return emailQueueBuilder()
        if (table === 'notification_events') {
          return {
            insert: async (row: Record<string, any>) => {
              db.skipped.push(row)
              return { error: null }
            },
          }
        }
        return emptyBuilder()
      },
      rpc: async () => ({ data: null, error: null }),
    }),
  }
})

vi.mock('@/lib/notifications/queue/processor', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>()
  return {
    ...actual,
    enqueueNotificationItem: async (...args: unknown[]) => {
      const result = await actual.enqueueNotificationItem(...args)
      enqueueSpy(args[0], result)
      return result
    },
  }
})

vi.mock('@/lib/notifications/in-app/service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createInAppNotification: (...args: unknown[]) => createInAppSpy(...args) }
})

import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { moduleCompletedEventId } from '@/lib/academy/module-completion'

function moduleCompleted(userId: string, moduleSlug: string, moduleName: string) {
  return {
    id: moduleCompletedEventId(userId, moduleSlug),
    event: 'module.completed',
    userId,
    userEmail: `${userId}@example.com`,
    userName: 'Jordan PM',
    userTimezone: 'UTC',
    priority: 'medium',
    category: 'learning',
    occurredAt: '2026-10-11T00:00:00.000Z',
    payload: { userId, moduleName, moduleSlug },
  } as any
}

/** [params, result] of every module-completed email the connector tried to enqueue. */
const moduleEmails = () =>
  enqueueSpy.mock.calls
    .map((c) => ({ params: c[0] as any, result: c[1] as any }))
    .filter((c) => c.params.templateKey === 'learning.module_complete')

beforeEach(() => {
  enqueueSpy.mockReset()
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  db.emailQueue.length = 0
  db.skipped.length = 0
  initializeNotificationConnectors(true)
})

describe('module.completed email connector', () => {
  it('keys each module email by its event id', async () => {
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'foundations', 'PM Foundations'))
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))

    const emails = moduleEmails()
    expect(emails).toHaveLength(2)
    expect(emails[0].params).toMatchObject({
      userId: 'user-1',
      channel: 'email',
      eventId: 'module-completed-user-1-foundations',
      eventType: 'module.completed',
      idempotencyKey: 'module-completed:module-completed-user-1-foundations',
    })
    expect(emails[1].params.idempotencyKey).toBe('module-completed:module-completed-user-1-discovery')
  })

  it('uses the same key when the same module event is replayed', async () => {
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))

    const keys = moduleEmails().map((e) => e.params.idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
  })

  it('queues an email for a second module instead of skipping it as a duplicate', async () => {
    const first = await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'foundations', 'PM Foundations'))
    const second = await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))
    expect(first.errors).toEqual([])
    expect(second.errors).toEqual([])

    expect(moduleEmails().map((e) => e.result.success)).toEqual([true, true])
    expect(db.emailQueue.map((r) => r.template_variables.moduleSlug)).toEqual(['foundations', 'discovery'])
    expect(db.skipped.map((r) => r.skipped_reason)).not.toContain('duplicate_event_id')
  })

  it('queues no second email when the same module event is replayed', async () => {
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))

    expect(db.emailQueue).toHaveLength(1)
    expect(moduleEmails()[1].result).toMatchObject({ success: false, duplicate: true })
  })

  it('does not let one learner’s module email suppress another learner’s', async () => {
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-1', 'discovery', 'Discovery'))
    await globalNotificationDispatcher.dispatch(moduleCompleted('user-2', 'discovery', 'Discovery'))

    expect(db.emailQueue.map((r) => r.user_id)).toEqual(['user-1', 'user-2'])
  })
})
