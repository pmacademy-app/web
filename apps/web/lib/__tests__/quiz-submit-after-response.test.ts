import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// Audit 2026-11-17 #8: quiz submit answers right after the scoring RPC. The streak update,
// notifications, referral check, module completion and certificate issuance run in after(),
// once the response is sent. Only the progress read stays inline, because the response
// carries isFirstLesson / totalCompletedLessons.

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Array<() => Promise<unknown>>,
  referralCheck: vi.fn(),
  dispatch: vi.fn(),
  streak: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (task: () => Promise<unknown>) => {
    mocks.afterTasks.push(task)
  },
}))
vi.mock('@/lib/streaks-db', () => ({ updateUserStreak: mocks.streak }))
vi.mock('@/lib/referral/referral-service', () => ({ onFirstLessonCompletedReferralCheck: mocks.referralCheck }))
vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: mocks.dispatch } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'

const USER = 'user-1'
const LESSON = 'les_04ix6b'
const attempts = [{ question_id: `q-${LESSON}-1`, selected_option: 0 }]

/** A client whose quiz RPC succeeds and whose progress read returns one completed lesson. */
function fakeSupabase() {
  const from = (table: string) => {
    let filters = 0
    const result = () =>
      table === 'user_lesson_progress' && filters === 1
        ? { data: [{ lesson_id: LESSON, status: 'completed' }], error: null }
        : { data: null, error: null }
    const builder: Record<string, unknown> = {
      eq: () => {
        filters += 1
        return proxy
      },
      single: async () => result(),
      maybeSingle: async () => result(),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result()).then(res, rej),
    }
    const proxy: Record<string, unknown> = new Proxy(builder, {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        return () => proxy
      },
    })
    return proxy
  }
  return {
    from: vi.fn(from),
    rpc: vi.fn(async () => ({ data: { success: true, total_xp_awarded: 5, is_first_attempt: true }, error: null })),
  } as unknown as SupabaseClient<Database>
}

beforeEach(() => {
  mocks.afterTasks.length = 0
  mocks.referralCheck.mockReset().mockResolvedValue({ rewarded: false })
  mocks.dispatch.mockReset().mockResolvedValue(undefined)
  mocks.streak.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('quiz submit defers its completion hooks to after()', () => {
  it('returns the scored result before the streak, notifications and referral run', async () => {
    const result = await recordQuizAttemptAction(fakeSupabase(), USER, LESSON, attempts)

    expect(result).toMatchObject({
      success: true,
      xpEarned: 5,
      isNewlyCompleted: true,
      isFirstLesson: true,
      totalCompletedLessons: 1,
    })
    expect(mocks.afterTasks).toHaveLength(1)
    expect(mocks.streak).not.toHaveBeenCalled()
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.referralCheck).not.toHaveBeenCalled()

    await mocks.afterTasks[0]()

    expect(mocks.streak).toHaveBeenCalledTimes(1)
    expect(mocks.referralCheck).toHaveBeenCalledTimes(1)
    const events = mocks.dispatch.mock.calls.map((call) => (call[0] as { event: string }).event)
    expect(events).toEqual(expect.arrayContaining(['quiz.completed', 'lesson.completed']))
  })

  it('a failing streak update in the deferred task does not stop the other hooks', async () => {
    mocks.streak.mockRejectedValue(new Error('streak unavailable'))

    await recordQuizAttemptAction(fakeSupabase(), USER, LESSON, attempts)
    await expect(mocks.afterTasks[0]()).resolves.toBeUndefined()

    expect(mocks.referralCheck).toHaveBeenCalledTimes(1)
    expect(mocks.dispatch).toHaveBeenCalled()
  })
})
