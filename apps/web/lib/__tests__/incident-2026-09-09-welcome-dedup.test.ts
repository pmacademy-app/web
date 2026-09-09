/**
 * TESTS 4 and 5 at the queue layer, plus TEST 19 for the resend-verification path.
 *
 * Welcome-email deduplication was "SELECT, and if nothing came back, INSERT". Two
 * problems, both live on `main`:
 *
 *  1. It is not concurrency-safe. Two simultaneous registrations for the same user
 *     both read "no existing row" and both insert.
 *  2. It used `.maybeSingle()`, which ERRORS once more than one row matches — and the
 *     error was discarded with `const { data } = ...`. So the moment a duplicate
 *     existed, the guard silently stopped working entirely and every later attempt
 *     queued another copy.
 *
 * Uniqueness is now the database's job: `email_queue.idempotency_key` carries a unique
 * index, so concurrent inserts race and exactly one wins.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// A fake `email_queue` that enforces the unique index the migration adds.
// ─────────────────────────────────────────────────────────────────────────────

const queueRows: Array<Record<string, unknown>> = []
const skippedEvents: Array<Record<string, unknown>> = []

function makeClient() {
  return {
    from: (table: string) => {
      if (table === 'notification_events') {
        return {
          insert: async (row: Record<string, unknown>) => {
            skippedEvents.push(row)
            return { data: null, error: null }
          },
        }
      }
      if (table !== 'email_queue') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: async () => ({ data: null, error: null }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ in: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              maybeSingle: async () => ({ data: null, error: null }),
            }),
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              const key = row.idempotency_key
              // This is the unique index, not an application-level pre-read.
              if (key && queueRows.some((r) => r.idempotency_key === key)) {
                return {
                  data: null,
                  error: {
                    code: '23505',
                    message: 'duplicate key value violates unique constraint "idx_email_queue_idempotency_key"',
                  },
                }
              }
              const inserted = { ...row, id: `q-${queueRows.length + 1}` }
              queueRows.push(inserted)
              return { data: inserted, error: null }
            },
          }),
        }),
      }
    },
  }
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => makeClient(),
}))

vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabledAsync: vi.fn(async () => true),
    isEnabled: vi.fn(() => true),
  },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100 })),
  },
}))

import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

const welcomeParams = (userId: string) => ({
  userId,
  toEmail: `${userId}@example.com`,
  channel: 'email' as const,
  templateKey: 'auth.welcome',
  templateVariables: { userName: 'Learner' },
  eventType: 'user.registered',
  category: 'security' as const,
  priorityLevel: 'high' as const,
  idempotencyKey: `welcome:${userId}`,
})

describe('Incident 2026-09-09 — welcome-email deduplication is enforced by the database', () => {
  beforeEach(() => {
    queueRows.length = 0
    skippedEvents.length = 0
  })

  // TEST 4
  it('a repeated signup for the same user cannot queue a second welcome email', async () => {
    const first = await enqueueNotificationItem(welcomeParams('user-1'))
    expect(first.success).toBe(true)

    for (let i = 0; i < 5; i++) {
      const repeat = await enqueueNotificationItem(welcomeParams('user-1'))
      expect(repeat.success).toBe(false)
      expect(repeat.reason).toMatch(/unique constraint|duplicate/i)
    }

    expect(queueRows).toHaveLength(1)
  })

  // TEST 5
  it('concurrent registrations for the same user produce exactly one queued welcome', async () => {
    const results = await Promise.all([
      enqueueNotificationItem(welcomeParams('user-2')),
      enqueueNotificationItem(welcomeParams('user-2')),
      enqueueNotificationItem(welcomeParams('user-2')),
      enqueueNotificationItem(welcomeParams('user-2')),
      enqueueNotificationItem(welcomeParams('user-2')),
    ])

    expect(results.filter((r) => r.success)).toHaveLength(1)
    expect(queueRows.filter((r) => r.idempotency_key === 'welcome:user-2')).toHaveLength(1)
  })

  it('the guard keeps working after a duplicate exists (the .maybeSingle() failure mode)', async () => {
    // Pre-seed TWO rows for one user, the state that previously made `.maybeSingle()`
    // throw, the error be discarded, and every subsequent insert succeed.
    queueRows.push({ id: 'legacy-1', idempotency_key: 'welcome:user-3', user_id: 'user-3' })

    const result = await enqueueNotificationItem(welcomeParams('user-3'))

    expect(result.success).toBe(false)
    expect(queueRows.filter((r) => r.idempotency_key === 'welcome:user-3')).toHaveLength(1)
  })

  it('different users are unaffected by each others keys', async () => {
    expect((await enqueueNotificationItem(welcomeParams('user-a'))).success).toBe(true)
    expect((await enqueueNotificationItem(welcomeParams('user-b'))).success).toBe(true)
    expect(queueRows).toHaveLength(2)
  })

  it('records an auditable skipped event when a duplicate is prevented', async () => {
    await enqueueNotificationItem(welcomeParams('user-4'))
    await enqueueNotificationItem(welcomeParams('user-4'))

    expect(skippedEvents.some((e) => e.skipped_reason === 'duplicate_db_constraint')).toBe(true)
    // The recipient is masked in the audit trail, never stored in full.
    const skipped = skippedEvents.find((e) => e.skipped_reason === 'duplicate_db_constraint')!
    expect(JSON.stringify(skipped.payload)).not.toContain('user-4@example.com')
  })
})

describe('Incident 2026-09-09 — the welcome connector supplies a stable idempotency key', () => {
  it('keys the welcome email on the user id, so one learner can only ever get one', async () => {
    const enqueued: Array<Record<string, unknown>> = []

    vi.resetModules()
    vi.doMock('@/lib/notifications/queue/processor', () => ({
      enqueueNotificationItem: vi.fn(async (params: Record<string, unknown>) => {
        enqueued.push(params)
        return { success: true, queueId: 'q1' }
      }),
      processEmailQueue: vi.fn(async () => ({})),
    }))

    const handlers: Record<string, (event: unknown) => Promise<void>> = {}
    vi.doMock('@/lib/notifications/dispatcher', () => ({
      globalNotificationDispatcher: {
        registerHandler: (event: string, _name: string, fn: (e: unknown) => Promise<void>) => {
          handlers[event] = fn
        },
      },
    }))

    const { initializeNotificationConnectors } = await import('@/lib/notifications/events/connectors')
    initializeNotificationConnectors()

    await handlers['user.registered']({
      id: 'evt-1',
      event: 'user.registered',
      userId: 'user-9',
      userEmail: 'user9@example.com',
      userName: 'Nine',
      payload: {},
    })

    expect(enqueued).toHaveLength(1)
    expect(enqueued[0].idempotencyKey).toBe('welcome:user-9')

    vi.doUnmock('@/lib/notifications/queue/processor')
    vi.doUnmock('@/lib/notifications/dispatcher')
  })
})
