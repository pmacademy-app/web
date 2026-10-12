/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The `badge.earned` and `xp.level_up` emails (`achievement.badge_earned`, `achievement.level_up`).
 *
 * Both events carry a stable id per learner per badge / per level (lib/badges-db.ts,
 * lib/xp/xp-service.ts). The email must follow it: one per badge, one per level, none for a
 * replay. Without an idempotency key the queue's fallback lookup is (user, template, event type),
 * so the first badge or level email suppressed every later one.
 *
 * Same harness as module-completed-email.test.ts: the connectors run against the real
 * `enqueueNotificationItem`, over an in-memory `email_queue` that enforces the unique
 * idempotency-key index.
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

function envelope(id: string, event: string, userId: string, payload: Record<string, unknown>) {
  return {
    id,
    event,
    userId,
    userEmail: `${userId}@example.com`,
    userName: 'Jordan PM',
    userTimezone: 'UTC',
    priority: 'high',
    category: 'achievements',
    occurredAt: '2026-10-12T00:00:00.000Z',
    payload: { userId, ...payload },
  } as any
}

// Ids as the producers build them: lib/badges-db.ts and lib/xp/xp-service.ts. The badge payload
// carries `badgeKey`, which the event registry's validator requires before any handler runs.
const badgeEarned = (userId: string, badgeKey: string) =>
  envelope(`badge-${userId}-${badgeKey}`, 'badge.earned', userId, {
    badgeKey,
    badgeName: badgeKey,
    badgeDescription: 'A badge',
  })

const levelUp = (userId: string, level: number) =>
  envelope(`level-up-${userId}-${level}`, 'xp.level_up', userId, {
    newLevel: level,
    levelTitle: 'PM',
    totalXp: (level - 1) * 500,
  })

/** params and result of every email the connectors tried to enqueue for `templateKey`. */
const emailsFor = (templateKey: string) =>
  enqueueSpy.mock.calls
    .map((c) => ({ params: c[0] as any, result: c[1] as any }))
    .filter((c) => c.params.templateKey === templateKey)

beforeEach(() => {
  enqueueSpy.mockReset()
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  db.emailQueue.length = 0
  db.skipped.length = 0
  initializeNotificationConnectors(true)
})

describe('badge.earned email connector', () => {
  it('queues an email for each badge a learner earns', async () => {
    const first = await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'first_lesson'))
    const second = await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'module_master'))
    expect(first.errors).toEqual([])
    expect(second.errors).toEqual([])

    const emails = emailsFor('achievement.badge_earned')
    expect(emails.map((e) => e.result.success)).toEqual([true, true])
    expect(emails.map((e) => e.params.idempotencyKey)).toEqual([
      'badge-earned:badge-user-1-first_lesson',
      'badge-earned:badge-user-1-module_master',
    ])
    expect(db.emailQueue.map((r) => r.template_variables.badgeName)).toEqual(['first_lesson', 'module_master'])
    expect(db.skipped.map((r) => r.skipped_reason)).not.toContain('duplicate_event_id')
  })

  it('queues no second email when the same badge event is replayed', async () => {
    await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'first_lesson'))
    await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'first_lesson'))

    expect(db.emailQueue).toHaveLength(1)
    expect(emailsFor('achievement.badge_earned')[1].result).toMatchObject({ success: false, duplicate: true })
  })

  it('does not let one learner’s badge email suppress another learner’s', async () => {
    await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'first_lesson'))
    await globalNotificationDispatcher.dispatch(badgeEarned('user-2', 'first_lesson'))

    expect(db.emailQueue.map((r) => r.user_id)).toEqual(['user-1', 'user-2'])
  })
})

describe('xp.level_up email connector', () => {
  it('queues an email for each level a learner reaches', async () => {
    const first = await globalNotificationDispatcher.dispatch(levelUp('user-1', 2))
    const second = await globalNotificationDispatcher.dispatch(levelUp('user-1', 3))
    expect(first.errors).toEqual([])
    expect(second.errors).toEqual([])

    const emails = emailsFor('achievement.level_up')
    expect(emails.map((e) => e.result.success)).toEqual([true, true])
    expect(emails.map((e) => e.params.idempotencyKey)).toEqual([
      'level-up:level-up-user-1-2',
      'level-up:level-up-user-1-3',
    ])
    expect(db.emailQueue.map((r) => r.template_variables.newLevel)).toEqual([2, 3])
    expect(db.skipped.map((r) => r.skipped_reason)).not.toContain('duplicate_event_id')
  })

  it('queues no second email when the same level event is replayed', async () => {
    await globalNotificationDispatcher.dispatch(levelUp('user-1', 2))
    await globalNotificationDispatcher.dispatch(levelUp('user-1', 2))

    expect(db.emailQueue).toHaveLength(1)
    expect(emailsFor('achievement.level_up')[1].result).toMatchObject({ success: false, duplicate: true })
  })

  it('does not let one learner’s level email suppress another learner’s', async () => {
    await globalNotificationDispatcher.dispatch(levelUp('user-1', 2))
    await globalNotificationDispatcher.dispatch(levelUp('user-2', 2))

    expect(db.emailQueue.map((r) => r.user_id)).toEqual(['user-1', 'user-2'])
  })

  it('keeps a badge email and a level email for the same learner apart', async () => {
    await globalNotificationDispatcher.dispatch(badgeEarned('user-1', 'first_lesson'))
    await globalNotificationDispatcher.dispatch(levelUp('user-1', 2))

    expect(db.emailQueue.map((r) => r.template_key)).toEqual(['achievement.badge_earned', 'achievement.level_up'])
  })
})
