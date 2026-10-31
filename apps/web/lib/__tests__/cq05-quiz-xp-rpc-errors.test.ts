/**
 * CQ-05: the quiz completion RPC error path in lib/academy/lessons-db.ts.
 *
 * Only a missing RPC (PGRST202 from PostgREST, 42883 undefined_function from Postgres) may fall
 * back to the non-atomic path. Any other RPC error, a thrown call, or an unexpected envelope is
 * a real fault and must throw: the RPC may already have written the attempts, so retrying them
 * non-atomically could double-record attempts and XP.
 *
 * The fallback is detected by its first write (the quiz_attempts insert). The fake makes that
 * insert fail with a sentinel error, so "the fallback ran" is "the sentinel was thrown".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { db } = vi.hoisted(() => ({
  db: {
    touched: [] as { table: string; op: string }[],
    rpc: null as unknown as ReturnType<typeof vi.fn>,
  },
}))

vi.mock('@/lib/xp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/xp')>()
  // No client: the static defaults, so the test never depends on a settings read.
  return { ...actual, getRuntimeXpValues: vi.fn(() => actual.getRuntimeXpValues()) }
})

vi.mock('@/lib/streaks-db', () => ({ updateUserStreak: vi.fn(async () => undefined) }))

vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: vi.fn(async () => undefined) },
}))

vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'

const LESSON = 'les_04ix6b'
const USER = 'cq05-user-1'
const ANSWERS = [{ question_id: `q-${LESSON}-1`, selected_option: 0 }]
const FALLBACK_SENTINEL = 'fallback-path-reached: quiz_attempts insert'

function fakeClient() {
  const rpc = vi.fn()
  db.rpc = rpc
  return {
    rpc,
    from: (table: string) => {
      let op = 'select'
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        insert: () => {
          op = 'insert'
          db.touched.push({ table, op })
          if (table === 'quiz_attempts') {
            return Promise.resolve({ data: null, error: new Error(FALLBACK_SENTINEL) })
          }
          return builder
        },
        upsert: () => {
          op = 'upsert'
          return builder
        },
        update: () => {
          op = 'update'
          return builder
        },
        maybeSingle: async () => {
          db.touched.push({ table, op })
          return { data: null, error: null }
        },
        then: (onFulfilled: (v: unknown) => unknown) => {
          db.touched.push({ table, op })
          return Promise.resolve({ data: [], error: null }).then(onFulfilled)
        },
      }
      return builder
    },
  }
}

let client: ReturnType<typeof fakeClient>

const run = () => recordQuizAttemptAction(client as never, USER, LESSON, ANSWERS)
const fallbackRan = () => db.touched.some((t) => t.table === 'quiz_attempts')

beforeEach(() => {
  vi.clearAllMocks()
  db.touched = []
  client = fakeClient()
})

describe('CQ-05: record_lesson_quiz_completion error handling', () => {
  it.each(['PGRST202', '42883'])('falls back to the non-atomic path when the RPC is missing (%s)', async (code) => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { code, message: 'function not found' } })

    await expect(run()).rejects.toThrow(FALLBACK_SENTINEL)
    expect(fallbackRan()).toBe(true)
  })

  it.each([
    ['40001', 'could not serialize access due to concurrent update'],
    ['23505', 'duplicate key value violates unique constraint'],
    ['PGRST301', 'JWT expired'],
    ['57014', 'canceling statement due to statement timeout'],
  ])('throws on a non-missing RPC error (%s) without running the fallback', async (code, message) => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { code, message } })

    await expect(run()).rejects.toThrow(`record_lesson_quiz_completion failed (${code})`)
    expect(fallbackRan()).toBe(false)
    expect(db.touched.filter((t) => t.op !== 'select')).toEqual([])
  })

  it('throws on an RPC error with no code rather than treating it as missing', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'gateway error' } })

    await expect(run()).rejects.toThrow('record_lesson_quiz_completion failed')
    expect(fallbackRan()).toBe(false)
  })

  it('propagates a thrown RPC call (network failure) without running the fallback', async () => {
    client.rpc.mockRejectedValueOnce(new Error('fetch failed'))

    await expect(run()).rejects.toThrow('fetch failed')
    expect(fallbackRan()).toBe(false)
  })

  it.each([
    ['null data', null],
    ['an array', [{ success: true }]],
    ['a scalar', 'ok'],
    ['success false', { success: false, total_xp_awarded: 30 }],
    ['no success flag', { total_xp_awarded: 30 }],
  ])('throws on an unexpected RPC envelope (%s) without running the fallback', async (_label, data) => {
    client.rpc.mockResolvedValueOnce({ data, error: null })

    await expect(run()).rejects.toThrow('record_lesson_quiz_completion returned an unexpected result')
    expect(fallbackRan()).toBe(false)
  })

  it('uses the RPC envelope on success and never runs the fallback', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { success: true, total_xp_awarded: 25, is_first_attempt: false },
      error: null,
    })

    const result = await run()

    expect(result).toMatchObject({ success: true, xpEarned: 25, isFirstAttempt: false })
    expect(client.rpc).toHaveBeenCalledTimes(1)
    expect(client.rpc).toHaveBeenCalledWith(
      'record_lesson_quiz_completion',
      expect.objectContaining({ p_user_id: USER, p_lesson_id: LESSON, p_correct_count: 1 })
    )
    expect(fallbackRan()).toBe(false)
  })

  it('treats a non-numeric total_xp_awarded as 0 XP', async () => {
    client.rpc.mockResolvedValueOnce({
      data: { success: true, total_xp_awarded: '25', is_first_attempt: false },
      error: null,
    })

    await expect(run()).resolves.toMatchObject({ xpEarned: 0 })
  })
})
