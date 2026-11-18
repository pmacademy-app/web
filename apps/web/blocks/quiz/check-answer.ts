/**
 * Client side of POST /api/v2/lessons/[lessonId]/quiz/check.
 *
 * The lesson payload carries no quiz answers, so QuizBlock asks the server after the learner
 * commits an answer. The route allows one check per (attempt, question); a second check is a
 * 429, which this maps to `already-answered` so the block can move on without revealing
 * anything and without crashing.
 */
import { apiPost } from '@/lib/api/client'

/** What the server revealed for one checked answer. */
export interface QuizCheckReveal {
  correct: boolean
  correctAnswer: number
  explanation: string
}

export type QuizCheckOutcome =
  | { kind: 'revealed'; reveal: QuizCheckReveal }
  /** This question was already checked in this attempt (429). Nothing is revealed. */
  | { kind: 'already-answered' }
  /** Offline, expired session, server fault: nothing is revealed and the learner can retry. */
  | { kind: 'error'; status: number; message: string }

export const QUIZ_CHECK_OFFLINE_MESSAGE =
  'We could not check your answer. Check your connection and try again.'
export const QUIZ_CHECK_SIGNED_OUT_MESSAGE =
  'Your session has expired. Sign in again to check your answer.'

/** The check route path for a lesson. */
export function quizCheckPath(lessonId: string): string {
  return `/api/v2/lessons/${encodeURIComponent(lessonId)}/quiz/check`
}

/** A random id for one quiz attempt. Matches the route's `[A-Za-z0-9_-]{8,64}`. */
export function createQuizAttemptId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`
}

/** Reads the reveal without trusting its shape. */
function readReveal(data: unknown, optionCount: number): QuizCheckReveal | null {
  if (!data || typeof data !== 'object') return null
  const { correct, correctAnswer, explanation } = data as Record<string, unknown>
  if (typeof correct !== 'boolean') return null
  if (
    typeof correctAnswer !== 'number' ||
    !Number.isInteger(correctAnswer) ||
    correctAnswer < 0 ||
    correctAnswer >= optionCount
  ) {
    return null
  }
  return { correct, correctAnswer, explanation: typeof explanation === 'string' ? explanation : '' }
}

export async function checkQuizAnswer(input: {
  lessonId: string
  questionId: string
  answer: number
  attemptId: string
  optionCount: number
}): Promise<QuizCheckOutcome> {
  const res = await apiPost<unknown>(quizCheckPath(input.lessonId), {
    questionId: input.questionId,
    answer: input.answer,
    attemptId: input.attemptId,
  })

  if (res.ok) {
    const reveal = readReveal(res.data, input.optionCount)
    if (reveal) return { kind: 'revealed', reveal }
    return { kind: 'error', status: res.status, message: QUIZ_CHECK_OFFLINE_MESSAGE }
  }

  const { status } = res.error
  if (status === 429) return { kind: 'already-answered' }
  if (status === 401) return { kind: 'error', status, message: QUIZ_CHECK_SIGNED_OUT_MESSAGE }
  return { kind: 'error', status, message: QUIZ_CHECK_OFFLINE_MESSAGE }
}
