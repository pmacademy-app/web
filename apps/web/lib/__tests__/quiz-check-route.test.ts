/**
 * Quiz answer check route (POST /api/v2/lessons/[lessonId]/quiz/check) and the submit
 * route's server-side scoring.
 *
 * The lesson payload carries no quiz answers, so the check route is the only place the
 * browser learns one, after committing an answer, at most once per (learner, attempt,
 * question). The limiter runs for real here: under vitest `evaluatePersistentRateLimit`
 * uses the in-memory counter, so the 429 on a second check is the real rule.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { actorState, accessState } = vi.hoisted(() => ({
  actorState: { kind: 'learner' as 'learner' | 'anonymous', userId: 'quiz-check-learner-1' },
  accessState: { locked: false },
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  return { ...actual, createServiceRoleClient: () => ({}) }
})

vi.mock('@/lib/api/actor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/actor')>()
  return {
    ...actual,
    resolveActor: vi.fn(async (_request: Request, policy: { allow: string[] }) => {
      if (actorState.kind === 'anonymous') {
        return policy.allow.includes('anonymous')
          ? { ok: true, actor: { kind: 'anonymous' } }
          : { ok: false, status: 401, code: 'UNAUTHORIZED', reason: 'no session' }
      }
      return { ok: true, actor: { kind: 'learner', userId: actorState.userId, email: 'q@example.com' } }
    }),
  }
})

vi.mock('@/lib/academy/lessons-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/academy/lessons-db')>()
  const { PublicError } = await import('@/lib/errors/public-error')
  return {
    ...actual,
    assertLessonAccessible: vi.fn(async () => {
      if (accessState.locked) {
        throw new PublicError('Complete the previous lesson to unlock this one.', {
          status: 403,
          code: 'LESSON_LOCKED',
        })
      }
    }),
    submitQuizAttempt: vi.fn(async () => ({
      correctCount: 0,
      totalQuestions: 15,
      scorePercentage: 0,
      isCompleted: false,
      xpEarned: 0,
    })),
  }
})

import { assertLessonAccessible, scoreQuizSubmission, submitQuizAttempt } from '@/lib/academy/lessons-db'
import { POST as checkPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/check/route'
import { POST as submitPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/route'

const LESSON = 'les_04ix6b'
const OTHER_LESSON = 'les_zoyq8a'

type Question = { id: string; options: string[]; correctAnswer: number; explanation: string }
const compiled = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons', `${LESSON}.json`), 'utf-8')
) as { blocks: { type: string; questions?: Question[] }[] }
const pool = compiled.blocks.find((b) => b.type === 'quiz')!.questions!
const first = pool[0]
const wrongAnswer = (q: Question) => (q.correctAnswer + 1) % q.options.length

let attemptSeq = 0
const newAttemptId = () => `attempt_${Date.now().toString(36)}_${attemptSeq++}`

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function check(lessonId: string, body: unknown) {
  return checkPOST(post(`http://localhost/api/v2/lessons/${lessonId}/quiz/check`, body), {
    params: Promise.resolve({ lessonId }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  actorState.kind = 'learner'
  actorState.userId = `quiz-check-learner-${attemptSeq++}`
  accessState.locked = false
})

describe('POST /api/v2/lessons/[lessonId]/quiz/check', () => {
  it('returns correctness, the correct option and the explanation for a right answer', async () => {
    const res = await check(LESSON, { questionId: first.id, answer: first.correctAnswer, attemptId: newAttemptId() })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      correct: true,
      correctAnswer: first.correctAnswer,
      explanation: first.explanation,
    })
    expect(assertLessonAccessible).toHaveBeenCalledWith(expect.anything(), actorState.userId, LESSON)
  })

  it('reports a wrong answer as incorrect and still reveals the correct option', async () => {
    const res = await check(LESSON, { questionId: first.id, answer: wrongAnswer(first), attemptId: newAttemptId() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.correct).toBe(false)
    expect(body.correctAnswer).toBe(first.correctAnswer)
    expect(body.explanation).toBe(first.explanation)
  })

  it('rejects an anonymous caller with 401 and reveals nothing', async () => {
    actorState.kind = 'anonymous'
    const res = await check(LESSON, { questionId: first.id, answer: 0, attemptId: newAttemptId() })
    expect(res.status).toBe(401)
    const text = await res.text()
    expect(text).not.toContain('correctAnswer')
    expect(text).not.toContain(first.explanation)
  })

  it('allows one check per question per attempt: a second check is 429, even with another option', async () => {
    const attemptId = newAttemptId()
    const firstRes = await check(LESSON, { questionId: first.id, answer: wrongAnswer(first), attemptId })
    expect(firstRes.status).toBe(200)

    const again = await check(LESSON, { questionId: first.id, answer: first.correctAnswer, attemptId })
    expect(again.status).toBe(429)
    const text = await again.text()
    expect(text).not.toContain(first.explanation)
    expect(text).toContain('RATE_LIMITED')

    // Other questions in the same attempt, and the same question in a new attempt, still work.
    expect((await check(LESSON, { questionId: pool[1].id, answer: 0, attemptId })).status).toBe(200)
    expect((await check(LESSON, { questionId: first.id, answer: 0, attemptId: newAttemptId() })).status).toBe(200)
  })

  it('keys the one-check rule per learner', async () => {
    const attemptId = newAttemptId()
    expect((await check(LESSON, { questionId: first.id, answer: 0, attemptId })).status).toBe(200)
    actorState.userId = `${actorState.userId}-other`
    expect((await check(LESSON, { questionId: first.id, answer: 0, attemptId })).status).toBe(200)
  })

  it('404s a well-formed question id that is not in the lesson', async () => {
    const res = await check(LESSON, { questionId: `q-${LESSON}-9999`, answer: 0, attemptId: newAttemptId() })
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')
  })

  it('404s a question from another lesson and an unknown lesson', async () => {
    const otherLessonQuestion = await check(LESSON, {
      questionId: `q-${OTHER_LESSON}-1`,
      answer: 0,
      attemptId: newAttemptId(),
    })
    expect(otherLessonQuestion.status).toBe(404)

    const unknown = await check('les_doesnotexist0', {
      questionId: 'q-les_doesnotexist0-1',
      answer: 0,
      attemptId: newAttemptId(),
    })
    expect(unknown.status).toBe(404)
  })

  it('400s a malformed body: bad question id, attempt id, or out-of-range answer', async () => {
    const bad = [
      { questionId: 'not-a-question', answer: 0, attemptId: newAttemptId() },
      { questionId: first.id, answer: 0, attemptId: 'short' },
      { questionId: first.id, answer: -1, attemptId: newAttemptId() },
      { questionId: first.id, answer: first.options.length, attemptId: newAttemptId() },
      { questionId: first.id, attemptId: newAttemptId() },
    ]
    for (const body of bad) {
      const res = await check(LESSON, body)
      expect(res.status, JSON.stringify(body)).toBe(400)
    }
  })

  it('does not reveal a locked lesson answer (403)', async () => {
    accessState.locked = true
    const res = await check(LESSON, { questionId: first.id, answer: 0, attemptId: newAttemptId() })
    expect(res.status).toBe(403)
    expect(await res.text()).not.toContain(first.explanation)
  })
})

describe('POST /api/v2/lessons/[lessonId]/quiz scores on the server', () => {
  it('drops client correctness flags before scoring', async () => {
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: wrongAnswer(q), is_correct: true }))
    const res = await submitPOST(post(`http://localhost/api/v2/lessons/${LESSON}/quiz`, { attempts }), {
      params: Promise.resolve({ lessonId: LESSON }),
    })
    expect(res.status).toBe(200)
    expect(submitQuizAttempt).toHaveBeenCalledWith(
      expect.anything(),
      actorState.userId,
      LESSON,
      pool.map((q) => ({ question_id: q.id, selected_option: wrongAnswer(q) })),
      { denyPerfectBonus: false }
    )
  })

  it('scoreQuizSubmission recomputes correctness from the compiled answer key', () => {
    const attempts = pool.map((q, i) => ({
      question_id: q.id,
      selected_option: i === 0 ? q.correctAnswer : wrongAnswer(q),
      is_correct: true,
    }))
    const scored = scoreQuizSubmission(pool, pool, attempts, { requireComplete: true })
    expect(scored.correctCount).toBe(1)
    expect(scored.totalQuestions).toBe(pool.length)
    expect(scored.validatedAttempts[1].is_correct).toBe(false)
  })
})
