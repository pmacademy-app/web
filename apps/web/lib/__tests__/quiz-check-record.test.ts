/**
 * Quiz check records (backlog C2).
 *
 * Receipts only help if the client sends them: a client could check a question, learn the
 * answer and submit without the receipt. With QUIZ_RECEIPT_SECRET set the check route also
 * writes an attempt-independent `lesson_quiz_checked_<userId>_<questionId>` row through the
 * persistent limiter, and the submit scores a recently checked question that has no valid
 * receipt as incorrect and withholds the perfect bonus.
 *
 * The limiter runs for real (in-memory under vitest) for the route's own rules; the wrapper
 * below also mirrors each record write into a fake `rate_limits` table, which the fake
 * service-role client reads back the way PostgREST would.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { actorState, table } = vi.hoisted(() => ({
  actorState: { userId: 'record-learner-1' },
  table: {
    rows: new Map<string, string>(),
    mode: 'ok' as 'ok' | 'error' | 'throw',
    reads: [] as string[][],
  },
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: vi.fn() }
})

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>()
  return {
    ...actual,
    evaluatePersistentRateLimit: vi.fn(async (key: string, options: { limit?: number; windowMs?: number } = {}) => {
      if (key.startsWith('lesson_quiz_checked_')) {
        // consume_rate_limit keeps last_requested_at at the start of the live window.
        const windowMs = options.windowMs ?? 60_000
        const last = table.rows.get(key)
        if (!last || Date.parse(last) < Date.now() - windowMs) table.rows.set(key, new Date().toISOString())
      }
      return actual.evaluatePersistentRateLimit(key, options)
    }),
  }
})

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  const rateLimits = {
    select: (columns: string) => {
      expect(columns).toBe('key, last_requested_at')
      return {
        in: (column: string, keys: string[]) => {
          expect(column).toBe('key')
          table.reads.push(keys)
          return {
            gte: async (col: string, iso: string) => {
              expect(col).toBe('last_requested_at')
              if (table.mode === 'throw') throw new Error('network down')
              if (table.mode === 'error') return { data: null, error: { message: 'db down' } }
              const data = keys
                .filter((k) => table.rows.has(k) && table.rows.get(k)! >= iso)
                .map((k) => ({ key: k, last_requested_at: table.rows.get(k)! }))
              return { data, error: null }
            },
          }
        },
      }
    },
  }
  return {
    ...actual,
    createServiceRoleClient: () => ({
      from: (name: string) => {
        expect(name).toBe('rate_limits')
        return rateLimits
      },
    }),
  }
})

vi.mock('@/lib/api/actor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/actor')>()
  return {
    ...actual,
    resolveActor: vi.fn(async () => ({
      ok: true,
      actor: { kind: 'learner', userId: actorState.userId, email: 'r@example.com' },
    })),
  }
})

vi.mock('@/lib/academy/lessons-db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/academy/lessons-db')>()
  return {
    ...actual,
    assertLessonAccessible: vi.fn(async () => {}),
    submitQuizAttempt: vi.fn(async () => ({
      correctCount: 0,
      totalQuestions: 15,
      scorePercentage: 0,
      isCompleted: false,
      xpEarned: 0,
    })),
  }
})

import { scoreQuizSubmission, submitQuizAttempt } from '@/lib/academy/lessons-db'
import {
  findRecentlyCheckedQuestions,
  QUIZ_CHECK_RECORD_LIMIT,
  QUIZ_CHECK_RECORD_LOOKBACK_MS,
  QUIZ_CHECK_RECORD_WINDOW_MS,
  quizCheckRecordKey,
  resetQuizReceiptWarningForTests,
} from '@/lib/academy/quiz-receipts'
import { createServiceRoleClient } from '@/lib/supabase'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { POST as checkPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/check/route'
import { POST as submitPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/route'

const SECRET = 'test-quiz-receipt-secret-0000000000000000' // synthetic, not a credential
const LESSON = 'les_04ix6b'

type Question = { id: string; options: string[]; correctAnswer: number; explanation: string }
const compiled = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons', `${LESSON}.json`), 'utf-8')
) as { blocks: { type: string; questions?: Question[] }[] }
const pool = compiled.blocks.find((b) => b.type === 'quiz')!.questions!
const first = pool[0]
const wrongAnswer = (q: Question) => (q.correctAnswer + 1) % q.options.length
const allCorrect = () => pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

let seq = 0
const newAttemptId = () => `rec_${Date.now().toString(36)}_${seq++}`

const ORIGINAL_SECRET = process.env.QUIZ_RECEIPT_SECRET
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  actorState.userId = `record-learner-${seq++}`
  table.rows.clear()
  table.reads.length = 0
  table.mode = 'ok'
  process.env.QUIZ_RECEIPT_SECRET = SECRET
  resetQuizReceiptWarningForTests()
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.QUIZ_RECEIPT_SECRET
  else process.env.QUIZ_RECEIPT_SECRET = ORIGINAL_SECRET
  warnSpy.mockRestore()
})

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function check(body: unknown) {
  return checkPOST(post(`http://localhost/api/v2/lessons/${LESSON}/quiz/check`, body), {
    params: Promise.resolve({ lessonId: LESSON }),
  })
}

function submit(body: unknown) {
  return submitPOST(post(`http://localhost/api/v2/lessons/${LESSON}/quiz`, body), {
    params: Promise.resolve({ lessonId: LESSON }),
  })
}

async function checkedReceipt(questionId: string, answer: number, attemptId: string): Promise<string> {
  const res = await check({ questionId, answer, attemptId })
  expect(res.status).toBe(200)
  return (await res.json()).receipt
}

function submittedAnswers(): { question_id: string; selected_option: number }[] {
  return vi.mocked(submitQuizAttempt).mock.calls[0][3]
}

function submitOptions(): { denyPerfectBonus?: boolean; forfeitedQuestionIds?: ReadonlySet<string> } | undefined {
  return vi.mocked(submitQuizAttempt).mock.calls[0][4]
}

describe('check route records the checked question', () => {
  it('consumes the attempt-independent per-question key with an unreachable limit', async () => {
    await checkedReceipt(first.id, wrongAnswer(first), newAttemptId())
    const key = quizCheckRecordKey(actorState.userId, first.id)
    expect(key).toBe(`lesson_quiz_checked_${actorState.userId}_${first.id}`)
    expect(evaluatePersistentRateLimit).toHaveBeenCalledWith(key, {
      limit: QUIZ_CHECK_RECORD_LIMIT,
      windowMs: QUIZ_CHECK_RECORD_WINDOW_MS,
    })
    expect(QUIZ_CHECK_RECORD_WINDOW_MS).toBe(2 * 60 * 60 * 1000)
    expect(table.rows.has(key)).toBe(true)
  })

  it('never blocks: the same question checks again in a new attempt', async () => {
    await checkedReceipt(first.id, 0, newAttemptId())
    await checkedReceipt(first.id, 1, newAttemptId())
    await checkedReceipt(first.id, 2, newAttemptId())
  })

  it('records nothing when the answer is not revealed (unknown question)', async () => {
    const res = await check({ questionId: `q-${LESSON}-9999`, answer: 0, attemptId: newAttemptId() })
    expect(res.status).toBe(404)
    expect(table.rows.size).toBe(0)
  })

  it('records nothing with the secret unset', async () => {
    delete process.env.QUIZ_RECEIPT_SECRET
    const res = await check({ questionId: first.id, answer: 0, attemptId: newAttemptId() })
    expect(res.status).toBe(200)
    expect(table.rows.size).toBe(0)
    const recordCalls = vi
      .mocked(evaluatePersistentRateLimit)
      .mock.calls.filter(([key]) => key.startsWith('lesson_quiz_checked_'))
    expect(recordCalls).toHaveLength(0)
  })
})

describe('submit route forfeits questions checked without a receipt', () => {
  it('scores a checked question submitted without its receipt as incorrect and withholds the bonus', async () => {
    await checkedReceipt(first.id, wrongAnswer(first), newAttemptId())
    const attempts = allCorrect()

    const res = await submit({ attempts })
    expect(res.status).toBe(200)
    expect(submittedAnswers()).toEqual(attempts)
    const options = submitOptions()
    expect(options?.denyPerfectBonus).toBe(true)
    expect([...(options?.forfeitedQuestionIds ?? [])]).toEqual([first.id])
    // One batched read for every unreceipted question.
    expect(table.reads).toHaveLength(1)
    expect(table.reads[0]).toHaveLength(pool.length)
  })

  it('also forfeits when the client sends an attempt id but leaves that receipt out', async () => {
    const attemptId = newAttemptId()
    const r0 = await checkedReceipt(pool[0].id, pool[0].correctAnswer, attemptId)
    await checkedReceipt(pool[1].id, wrongAnswer(pool[1]), attemptId)

    await submit({ attempts: allCorrect(), attemptId, receipts: [r0] })
    const options = submitOptions()
    expect([...(options?.forfeitedQuestionIds ?? [])]).toEqual([pool[1].id])
    expect(options?.denyPerfectBonus).toBe(true)
    // The receipted question is not looked up.
    expect(table.reads[0]).not.toContain(quizCheckRecordKey(actorState.userId, pool[0].id))
  })

  it('scores as before when nothing was checked (offline or older client)', async () => {
    const attempts = allCorrect()
    await submit({ attempts })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it('ignores a record older than the lookback', async () => {
    table.rows.set(
      quizCheckRecordKey(actorState.userId, first.id),
      new Date(Date.now() - QUIZ_CHECK_RECORD_LOOKBACK_MS - 60_000).toISOString()
    )
    await submit({ attempts: allCorrect() })
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it("does not use another learner's record", async () => {
    await checkedReceipt(first.id, 0, newAttemptId())
    actorState.userId = `${actorState.userId}-other`
    await submit({ attempts: allCorrect() })
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it('keeps receipted scoring and the bonus when every question has a receipt', async () => {
    const attemptId = newAttemptId()
    const receipts = await Promise.all(pool.map((q) => checkedReceipt(q.id, q.correctAnswer, attemptId)))
    await submit({ attempts: allCorrect(), attemptId, receipts })
    expect(submittedAnswers()).toEqual(allCorrect())
    expect(submitOptions()).toEqual({ denyPerfectBonus: false })
    expect(table.reads).toHaveLength(0)
  })

  it('allows a retry attempt after seeing answers when it carries the new receipts', async () => {
    const firstAttempt = newAttemptId()
    await Promise.all(pool.map((q) => checkedReceipt(q.id, wrongAnswer(q), firstAttempt)))
    const retry = newAttemptId()
    const receipts = await Promise.all(pool.map((q) => checkedReceipt(q.id, q.correctAnswer, retry)))

    await submit({ attempts: allCorrect(), attemptId: retry, receipts })
    expect(submittedAnswers()).toEqual(allCorrect())
    expect(submitOptions()).toEqual({ denyPerfectBonus: false })
  })

  it.each(['error', 'throw'] as const)('fails open when the lookup %s, warning with the user id only', async (mode) => {
    await checkedReceipt(first.id, wrongAnswer(first), newAttemptId())
    table.mode = mode
    const attempts = allCorrect()

    await submit({ attempts })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
    const warning = warnSpy.mock.calls.find((c: unknown[]) => String(c[0]).includes('check record lookup failed'))
    expect(warning?.[1]).toEqual({ userId: actorState.userId })
  })

  it('with the secret unset ignores records and scores as before', async () => {
    await checkedReceipt(first.id, wrongAnswer(first), newAttemptId())
    delete process.env.QUIZ_RECEIPT_SECRET
    const attempts = allCorrect()

    await submit({ attempts })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: false })
    expect(table.reads).toHaveLength(0)
  })
})

describe('findRecentlyCheckedQuestions', () => {
  it('maps record keys back to question ids and skips the read for no questions', async () => {
    const db = createServiceRoleClient()
    expect(await findRecentlyCheckedQuestions(db, 'u-9', [])).toEqual(new Set())
    expect(table.reads).toHaveLength(0)

    table.rows.set(quizCheckRecordKey('u-9', pool[2].id), new Date().toISOString())
    const found = await findRecentlyCheckedQuestions(db, 'u-9', [pool[1].id, pool[2].id])
    expect(found).toEqual(new Set([pool[2].id]))
  })
})

describe('scoreQuizSubmission forfeited questions', () => {
  it('scores a forfeited question as incorrect but records the submitted option', () => {
    const defs = pool.map((q) => ({ id: q.id, correctAnswer: q.correctAnswer }))
    const scored = scoreQuizSubmission(defs, defs, allCorrect(), {
      requireComplete: true,
      forfeited: new Set([first.id]),
    })
    expect(scored.correctCount).toBe(pool.length - 1)
    expect(scored.validatedAttempts[0]).toEqual({
      question_id: first.id,
      selected_option: first.correctAnswer,
      is_correct: false,
    })
    expect(scored.validatedAttempts.slice(1).every((a) => a.is_correct)).toBe(true)
  })
})
