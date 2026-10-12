import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// The referral reward is paid when the referred learner has completed a lesson. The check used to
// run only on the completion that made the count exactly 1, so an activation that failed there (a
// settings read, the XP insert, the status update) was never tried again and the referrer was never
// paid. It now runs on every completion; the check itself no-ops on one indexed read when the
// learner has no `signed_up` referral (see referral-system.test.ts, section 3b).

const mocks = vi.hoisted(() => ({ referralCheck: vi.fn(), dispatch: vi.fn() }))

vi.mock('@/lib/referral/referral-service', () => ({ onFirstLessonCompletedReferralCheck: mocks.referralCheck }))
vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: mocks.dispatch } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'

const USER = 'user-1'
const LESSON = 'les_04ix6b'
const attempts = [{ question_id: `q-${LESSON}-1`, selected_option: 0 }]

/** A client whose quiz RPC succeeds and whose progress read returns `completed` lessons (or fails). */
function fakeSupabase(completed: number, progressError: { message: string } | null = null) {
  const from = (table: string) => {
    let filters = 0
    const result = () => {
      // The completion hooks read every progress row of the learner: one filter (user_id).
      if (table === 'user_lesson_progress' && filters === 1) {
        return progressError
          ? { data: null, error: progressError }
          : { data: Array.from({ length: completed }, (_, i) => ({ lesson_id: `les_mock_${i}`, status: 'completed' })), error: null }
      }
      return { data: null, error: null }
    }
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
  mocks.referralCheck.mockReset().mockResolvedValue({ rewarded: false, reason: 'no_pending_referral' })
  mocks.dispatch.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('recordQuizAttemptAction referral activation check', () => {
  it('runs on the first completed lesson', async () => {
    const supabase = fakeSupabase(1)

    const result = await recordQuizAttemptAction(supabase, USER, LESSON, attempts)

    expect(result).toMatchObject({ success: true, isFirstLesson: true })
    expect(mocks.referralCheck).toHaveBeenCalledTimes(1)
    expect(mocks.referralCheck).toHaveBeenCalledWith(supabase, USER)
  })

  it('runs again on later lessons, so a failed activation is retried', async () => {
    const result = await recordQuizAttemptAction(fakeSupabase(2), USER, LESSON, attempts)

    expect(result).toMatchObject({ success: true, isFirstLesson: false, totalCompletedLessons: 2 })
    expect(mocks.referralCheck).toHaveBeenCalledTimes(1)

    await recordQuizAttemptAction(fakeSupabase(37), USER, LESSON, attempts)
    expect(mocks.referralCheck).toHaveBeenCalledTimes(2)
  })

  it('does not run for a learner with no completed lesson: that is what activates a referral', async () => {
    await recordQuizAttemptAction(fakeSupabase(0), USER, LESSON, attempts)

    expect(mocks.referralCheck).not.toHaveBeenCalled()
  })

  it('does not run when the completed-lesson count could not be read', async () => {
    await recordQuizAttemptAction(fakeSupabase(3, { message: 'progress unavailable' }), USER, LESSON, attempts)

    expect(mocks.referralCheck).not.toHaveBeenCalled()
  })

  it('never fails the quiz submission when the check throws', async () => {
    mocks.referralCheck.mockRejectedValue(new Error('referrals unavailable'))

    const result = await recordQuizAttemptAction(fakeSupabase(2), USER, LESSON, attempts)

    expect(result.success).toBe(true)
  })
})
