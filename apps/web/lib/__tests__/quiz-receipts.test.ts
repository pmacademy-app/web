/**
 * Quiz check receipts (lib/academy/quiz-receipts.ts).
 *
 * The check route reveals a question's correct option after the learner commits an answer.
 * With QUIZ_RECEIPT_SECRET set it also signs the checked answer, and the submit route scores
 * that answer for the question, so a learner cannot check a wrong option, learn the right one
 * and submit the right one. Without the secret nothing changes.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { actorState } = vi.hoisted(() => ({
  actorState: { userId: 'receipt-learner-1' },
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

import { submitQuizAttempt } from '@/lib/academy/lessons-db'
import {
  applyQuizReceipts,
  getQuizReceiptSecret,
  QUIZ_RECEIPT_MAX_AGE_SECONDS,
  resetQuizReceiptWarningForTests,
  signQuizReceipt,
  verifyQuizReceipt,
} from '@/lib/academy/quiz-receipts'
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

let seq = 0
const newAttemptId = () => `rcpt_${Date.now().toString(36)}_${seq++}`

const ORIGINAL_SECRET = process.env.QUIZ_RECEIPT_SECRET
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  actorState.userId = `receipt-learner-${seq++}`
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

function submittedAnswers(): { question_id: string; selected_option: number }[] {
  return vi.mocked(submitQuizAttempt).mock.calls[0][3]
}

function submitOptions(): unknown {
  return vi.mocked(submitQuizAttempt).mock.calls[0][4]
}

describe('signQuizReceipt / verifyQuizReceipt', () => {
  const ctx = { userId: 'u-1', lessonId: LESSON, attemptId: 'attempt_abc123' }
  const claims = { ...ctx, questionId: first.id, answer: 2 }
  const now = 1_800_000_000

  it('round-trips the claims', () => {
    const receipt = signQuizReceipt({ ...claims, issuedAt: now }, SECRET)
    expect(receipt).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(verifyQuizReceipt(receipt, ctx, SECRET, now + 60)).toEqual({
      ok: true,
      claims: { ...claims, issuedAt: now },
    })
  })

  it('rejects a tampered payload, a tampered signature and another secret', () => {
    const receipt = signQuizReceipt({ ...claims, issuedAt: now }, SECRET)
    const [payload, signature] = receipt.split('.')
    const forgedPayload = Buffer.from(
      JSON.stringify({ u: ctx.userId, l: LESSON, q: first.id, a: 0, t: ctx.attemptId, iat: now }),
      'utf8'
    ).toString('base64url')
    expect(verifyQuizReceipt(`${forgedPayload}.${signature}`, ctx, SECRET, now)).toEqual({ ok: false, reason: 'signature' })
    const flipped = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A')
    expect(verifyQuizReceipt(`${payload}.${flipped}`, ctx, SECRET, now).ok).toBe(false)
    expect(verifyQuizReceipt(receipt, ctx, `${SECRET}-other`, now)).toEqual({ ok: false, reason: 'signature' })
    expect(verifyQuizReceipt('not-a-receipt', ctx, SECRET, now)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyQuizReceipt(`${payload}.${signature}.x`, ctx, SECRET, now)).toEqual({ ok: false, reason: 'malformed' })
  })

  it('rejects a receipt for another user, lesson or attempt', () => {
    const receipt = signQuizReceipt({ ...claims, issuedAt: now }, SECRET)
    for (const other of [
      { ...ctx, userId: 'u-2' },
      { ...ctx, lessonId: 'les_zoyq8a' },
      { ...ctx, attemptId: 'attempt_other1' },
    ]) {
      expect(verifyQuizReceipt(receipt, other, SECRET, now)).toEqual({ ok: false, reason: 'mismatch' })
    }
  })

  it('rejects an expired receipt and one issued far in the future', () => {
    const receipt = signQuizReceipt({ ...claims, issuedAt: now }, SECRET)
    expect(verifyQuizReceipt(receipt, ctx, SECRET, now + QUIZ_RECEIPT_MAX_AGE_SECONDS).ok).toBe(true)
    expect(verifyQuizReceipt(receipt, ctx, SECRET, now + QUIZ_RECEIPT_MAX_AGE_SECONDS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    })
    expect(verifyQuizReceipt(receipt, ctx, SECRET, now - 3600)).toEqual({ ok: false, reason: 'expired' })
  })

  it('applyQuizReceipts replaces checked answers and counts invalid or conflicting receipts', () => {
    const attempt = 'attempt_apply01'
    const sign = (questionId: string, answer: number) =>
      signQuizReceipt({ userId: 'u-1', lessonId: LESSON, attemptId: attempt, questionId, answer, issuedAt: now }, SECRET)
    const attempts = [
      { question_id: pool[0].id, selected_option: 1 },
      { question_id: pool[1].id, selected_option: 3 },
      { question_id: pool[2].id, selected_option: 0 },
    ]
    const out = applyQuizReceipts(
      attempts,
      [sign(pool[0].id, 2), sign(pool[1].id, 3), sign(pool[1].id, 0), 'junk.receipt'],
      { userId: 'u-1', lessonId: LESSON, attemptId: attempt },
      SECRET,
      now
    )
    expect(out.attempts.map((a) => a.selected_option)).toEqual([2, 3, 0])
    expect(out.replaced).toBe(1)
    expect(out.invalid).toBe(2)

    const noAttempt = applyQuizReceipts(attempts, [sign(pool[0].id, 2)], { userId: 'u-1', lessonId: LESSON, attemptId: undefined }, SECRET, now)
    expect(noAttempt.attempts).toEqual(attempts)
    expect(noAttempt.invalid).toBe(1)
  })

  it('treats a missing or short secret as off and warns once per process', () => {
    delete process.env.QUIZ_RECEIPT_SECRET
    expect(getQuizReceiptSecret()).toBeNull()
    expect(getQuizReceiptSecret()).toBeNull()
    process.env.QUIZ_RECEIPT_SECRET = 'too-short'
    expect(getQuizReceiptSecret()).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    process.env.QUIZ_RECEIPT_SECRET = SECRET
    expect(getQuizReceiptSecret()).toBe(SECRET)
  })
})

describe('check route receipts', () => {
  it('returns a receipt of the checked answer when the secret is set', async () => {
    const attemptId = newAttemptId()
    const res = await check({ questionId: first.id, answer: wrongAnswer(first), attemptId })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ correct: false, correctAnswer: first.correctAnswer, explanation: first.explanation })
    const verdict = verifyQuizReceipt(body.receipt, { userId: actorState.userId, lessonId: LESSON, attemptId }, SECRET)
    expect(verdict.ok && verdict.claims).toMatchObject({ questionId: first.id, answer: wrongAnswer(first) })
  })

  it('returns no receipt when the secret is unset, and warns once', async () => {
    delete process.env.QUIZ_RECEIPT_SECRET
    const a = await check({ questionId: first.id, answer: 0, attemptId: newAttemptId() })
    const b = await check({ questionId: pool[1].id, answer: 0, attemptId: newAttemptId() })
    expect(Object.keys(await a.json()).sort()).toEqual(['correct', 'correctAnswer', 'explanation'])
    expect((await b.json()).receipt).toBeUndefined()
    const receiptWarnings = warnSpy.mock.calls.filter((c: unknown[]) => String(c[0]).includes('QUIZ_RECEIPT_SECRET'))
    expect(receiptWarnings).toHaveLength(1)
  })
})

describe('submit route scores checked questions from their receipts', () => {
  async function checkedReceipt(questionId: string, answer: number, attemptId: string): Promise<string> {
    const res = await check({ questionId, answer, attemptId })
    return (await res.json()).receipt
  }

  it('scores the checked answer when the client changes it after the reveal', async () => {
    const attemptId = newAttemptId()
    const receipt = await checkedReceipt(first.id, wrongAnswer(first), attemptId)
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    const res = await submit({ attempts, attemptId, receipts: [receipt] })
    expect(res.status).toBe(200)
    const scored = submittedAnswers()
    expect(scored[0]).toEqual({ question_id: first.id, selected_option: wrongAnswer(first) })
    expect(scored.slice(1)).toEqual(attempts.slice(1))
    // Only one of the submitted questions carries a receipt, so the perfect bonus is withheld.
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it('keeps the perfect bonus when every submitted question has a valid receipt', async () => {
    const attemptId = newAttemptId()
    const receipts = await Promise.all(pool.map((q) => checkedReceipt(q.id, q.correctAnswer, attemptId)))
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    const res = await submit({ attempts, attemptId, receipts })
    expect(res.status).toBe(200)
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: false })
  })

  it('ignores a forged receipt, keeps the submitted answer and withholds the perfect bonus', async () => {
    const attemptId = newAttemptId()
    const forged = signQuizReceipt(
      { userId: actorState.userId, lessonId: LESSON, questionId: first.id, answer: first.correctAnswer, attemptId },
      'attacker-chosen-secret-0123456789abcdef'
    )
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    const res = await submit({ attempts, attemptId, receipts: [forged] })
    expect(res.status).toBe(200)
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
    const warning = warnSpy.mock.calls.find((c: unknown[]) => String(c[0]).includes('invalid receipt'))
    expect(warning?.[1]).toEqual({ userId: actorState.userId })
  })

  it("ignores another learner's receipt and withholds the bonus", async () => {
    const attemptId = newAttemptId()
    const receipt = await checkedReceipt(first.id, wrongAnswer(first), attemptId)
    actorState.userId = `${actorState.userId}-other`
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    await submit({ attempts, attemptId, receipts: [receipt] })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it('without receipts scores the submitted answers but withholds the perfect bonus', async () => {
    // Leaving receipts out must not be a way to submit answers learned from the check and
    // still collect the first-attempt perfect bonus.
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: wrongAnswer(q) }))
    await submit({ attempts })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })

    vi.clearAllMocks()
    await submit({ attempts, attemptId: newAttemptId(), receipts: [] })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: true })
  })

  it('with the secret unset ignores receipts and scores as before', async () => {
    const attemptId = newAttemptId()
    const receipt = await checkedReceipt(first.id, wrongAnswer(first), attemptId)
    delete process.env.QUIZ_RECEIPT_SECRET
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    await submit({ attempts, attemptId, receipts: [receipt, 'garbage.value'] })
    expect(submittedAnswers()).toEqual(attempts)
    expect(submitOptions()).toEqual({ denyPerfectBonus: false })
  })

  it('400s a malformed attempt id or an oversized receipt', async () => {
    const attempts = pool.map((q) => ({ question_id: q.id, selected_option: 0 }))
    expect((await submit({ attempts, attemptId: 'bad id!', receipts: [] })).status).toBe(400)
    expect((await submit({ attempts, attemptId: newAttemptId(), receipts: ['x'.repeat(600)] })).status).toBe(400)
    expect(submitQuizAttempt).not.toHaveBeenCalled()
  })
})
