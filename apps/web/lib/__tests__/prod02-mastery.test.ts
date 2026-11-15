/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'
import { lessonCompletedFromQuiz } from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content'

vi.mock('@/lib/streaks-db', () => ({
  updateUserStreak: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/xp', () => ({
  verifyTheoryReadEngagement: vi.fn(),
  getRuntimeXpValues: vi.fn().mockResolvedValue({
    QUIZ_CORRECT: 10,
    QUIZ_PERFECT_BONUS: 20,
    REFLECTION_SUBMITTED: 30,
  }),
}))

const mockDispatch = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: {
    dispatch: (...args: unknown[]) => mockDispatch(...args),
  },
}))

vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

function createFakeSupabase(rpcHandler: (rpcName: string, params: any) => Promise<any>) {
  const tables: Record<string, any[]> = {
    users: [{ id: 'user-mastery', email: 'user@example.com', name: 'Learner' }],
    user_lesson_progress: [],
    user_flashcard_srs: [],
  }

  const client: any = {
    rpc: vi.fn().mockImplementation((name, params) => rpcHandler(name, params)),
    from: vi.fn().mockImplementation((tableName: string) => {
      const state = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(async () => {
          const row = (tables[tableName] || []).find((r) => r.id === 'user-mastery' || r.user_id === 'user-mastery')
          return { data: row || null, error: null }
        }),
        single: vi.fn().mockImplementation(async () => {
          const row = (tables[tableName] || []).find((r) => r.id === 'user-mastery' || r.user_id === 'user-mastery')
          return { data: row || null, error: null }
        }),
        upsert: vi.fn().mockImplementation(async (data: any) => {
          const rows = Array.isArray(data) ? data : [data]
          if (!tables[tableName]) tables[tableName] = []
          tables[tableName].push(...rows)
          return { data: rows, error: null }
        }),
      }
      return state
    }),
    _tables: tables,
  }

  return client
}

describe('PROD-02 / AG-28: Lesson mastery threshold at 70 percent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('score below 70 percent marks lesson in_progress and does not complete', async () => {
    const fake = createFakeSupabase(async (_name, params) => {
      expect(params.p_score_percentage).toBe(33)
      return {
        data: {
          success: true,
          status: 'in_progress',
          is_passed: false,
          is_newly_completed: false,
          quiz_attempts: 1,
          quiz_score: 33,
          best_score: 33,
          total_xp_awarded: 10,
          is_first_attempt: true,
        },
        error: null,
      }
    })

    const result = await recordQuizAttemptAction(fake, 'user-mastery', 'les_04ix6b', [
      { question_id: 'q-les_04ix6b-1', selected_option: 0 },
      { question_id: 'q-les_04ix6b-2', selected_option: 0 },
      { question_id: 'q-les_04ix6b-3', selected_option: 1 },
    ])

    expect(result.success).toBe(true)
    expect(result.isCompleted).toBe(false)
    expect(result.isPassed).toBe(false)
    expect(result.isNewlyCompleted).toBe(false)

    const dispatchedEvents = mockDispatch.mock.calls.map((call) => call[0].event)
    expect(dispatchedEvents).toContain('quiz.completed')
    expect(dispatchedEvents).not.toContain('lesson.completed')
  })

  it('score at 70 percent or above marks lesson completed and dispatches lesson.completed', async () => {
    const fake = createFakeSupabase(async (_name, params) => {
      expect(params.p_score_percentage).toBe(100)
      return {
        data: {
          success: true,
          status: 'completed',
          is_passed: true,
          is_newly_completed: true,
          quiz_attempts: 1,
          quiz_score: 100,
          best_score: 100,
          total_xp_awarded: 30,
          is_first_attempt: true,
        },
        error: null,
      }
    })

    const result = await recordQuizAttemptAction(fake, 'user-mastery', 'les_04ix6b', [
      { question_id: 'q-les_04ix6b-1', selected_option: 0 },
    ])

    expect(result.success).toBe(true)
    expect(result.isCompleted).toBe(true)
    expect(result.isPassed).toBe(true)
    expect(result.isNewlyCompleted).toBe(true)

    const dispatchedEvents = mockDispatch.mock.calls.map((call) => call[0].event)
    expect(dispatchedEvents).toContain('quiz.completed')
    expect(dispatchedEvents).toContain('lesson.completed')
  })

  it('subsequent retake with lower score never downgrades completed status', async () => {
    const fake = createFakeSupabase(async (_name, params) => {
      expect(params.p_score_percentage).toBe(0)
      return {
        data: {
          success: true,
          status: 'completed',
          is_passed: true,
          is_newly_completed: false,
          quiz_attempts: 2,
          quiz_score: 0,
          best_score: 100,
          total_xp_awarded: 0,
          is_first_attempt: false,
          was_already_completed: true,
        },
        error: null,
      }
    })

    const result = await recordQuizAttemptAction(fake, 'user-mastery', 'les_04ix6b', [
      { question_id: 'q-les_04ix6b-1', selected_option: 3 },
    ])

    expect(result.success).toBe(true)
    expect(result.isCompleted).toBe(true)
    expect(result.bestScore).toBe(100)
    expect(result.isNewlyCompleted).toBe(false)

    const dispatchedEvents = mockDispatch.mock.calls.map((call) => call[0].event)
    expect(dispatchedEvents).toContain('quiz.completed')
    expect(dispatchedEvents).not.toContain('lesson.completed')
  })

  it('enqueues flashcards for wrong quiz answers', async () => {
    const fake = createFakeSupabase(async () => ({
      data: {
        success: true,
        status: 'in_progress',
        is_passed: false,
        is_newly_completed: false,
        quiz_attempts: 1,
        quiz_score: 0,
        best_score: 0,
        total_xp_awarded: 0,
        is_first_attempt: true,
      },
      error: null,
    }))

    await recordQuizAttemptAction(fake, 'user-mastery', 'les_04ix6b', [
      { question_id: 'q-les_04ix6b-1', selected_option: 3 },
    ])

    const srsRows = fake._tables.user_flashcard_srs || []
    expect(srsRows.length).toBeGreaterThan(0)
    expect(srsRows[0].flashcard_id).toBe('fc-les_04ix6b-1')
    expect(srsRows[0].repetitions).toBe(0)
  })

  it('lessonCompletedFromQuiz correctly distinguishes pass vs fail', () => {
    expect(lessonCompletedFromQuiz({ isPassed: true, isCompleted: true })).toBe(true)
    expect(lessonCompletedFromQuiz({ isPassed: false, isCompleted: false })).toBe(false)
    expect(lessonCompletedFromQuiz({ isPassed: false, success: true })).toBe(false)
    expect(lessonCompletedFromQuiz({ isCompleted: true })).toBe(true)
    expect(lessonCompletedFromQuiz({ success: true })).toBe(true)
    expect(lessonCompletedFromQuiz(null)).toBe(false)
  })
})
