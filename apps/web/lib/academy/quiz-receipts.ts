/**
 * Signed quiz check receipts.
 *
 * POST .../quiz/check reveals a question's correct option after the learner commits an answer.
 * Without a receipt the final submit (POST .../quiz) would score whatever the client sends, so
 * a learner could check a wrong option, learn the right one, and submit the right one. The
 * check route therefore signs the answer it checked, and the submit scores the signed answer
 * for every question that carries a valid receipt.
 *
 * Format: `<payload>.<signature>`, both base64url. The payload is the JSON
 * `{u, l, q, a, t, iat}` (user id, lesson id, question id, answer index, attempt id, issued-at
 * in Unix seconds). The signature is HMAC-SHA256 over `qr1.<payload>` with the server secret
 * QUIZ_RECEIPT_SECRET.
 *
 * Check records: a receipt only helps if the client sends it. To stop a client from checking a
 * question, learning the answer and then submitting without the receipt, the check route also
 * writes an attempt-independent record per (learner, question) into the persistent limiter
 * table (`rate_limits`, key `lesson_quiz_checked_<userId>_<questionId>`). The submit reads those
 * records for every question that has no valid receipt: a recent record means the learner saw
 * the answer without proving which option they committed to, so that question scores as
 * incorrect and the perfect bonus is withheld. A question with no record keeps the submitted
 * answer (offline fallback, older clients).
 *
 * Rollout: without the secret (or with one shorter than 32 characters) receipts are off: the
 * check route issues no receipt and writes no record, and the submit scores exactly as before.
 * One warning is logged per process, not per request.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase'

/** Random id the client mints per quiz attempt (crypto.randomUUID or a fallback). */
export const QUIZ_ATTEMPT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** A receipt is a few hundred characters; anything longer is not one. */
export const QUIZ_RECEIPT_MAX_LENGTH = 512

/** How long a receipt stays usable. A quiz attempt takes minutes. */
export const QUIZ_RECEIPT_MAX_AGE_SECONDS = 24 * 60 * 60

/** Clock skew tolerated for an issued-at slightly in the future (multi-instance clocks). */
const FUTURE_SKEW_SECONDS = 5 * 60

const MIN_SECRET_LENGTH = 32
const MAC_DOMAIN = 'qr1.'

export interface QuizReceiptClaims {
  userId: string
  lessonId: string
  questionId: string
  answer: number
  attemptId: string
  /** Unix seconds. */
  issuedAt: number
}

export interface QuizReceiptContext {
  userId: string
  lessonId: string
  attemptId: string
}

export type QuizReceiptVerdict =
  | { ok: true; claims: QuizReceiptClaims }
  | { ok: false; reason: 'malformed' | 'signature' | 'mismatch' | 'expired' }

let warnedMissingSecret = false

/**
 * The receipt secret, or null when receipts are off. Logs one warning per process when the
 * secret is missing or too short.
 */
export function getQuizReceiptSecret(): string | null {
  const secret = process.env.QUIZ_RECEIPT_SECRET
  if (secret && secret.length >= MIN_SECRET_LENGTH) return secret
  if (!warnedMissingSecret) {
    warnedMissingSecret = true
    console.warn(
      secret
        ? '[quiz-receipts] QUIZ_RECEIPT_SECRET is shorter than 32 characters; quiz receipts are off and quiz submits are scored from the submitted answers.'
        : '[quiz-receipts] QUIZ_RECEIPT_SECRET is not set; quiz receipts are off and quiz submits are scored from the submitted answers.'
    )
  }
  return null
}

/** Test hook: lets a test observe the one-time warning again. */
export function resetQuizReceiptWarningForTests(): void {
  warnedMissingSecret = false
}

function mac(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(MAC_DOMAIN + payload).digest()
}

export function signQuizReceipt(
  claims: Omit<QuizReceiptClaims, 'issuedAt'> & { issuedAt?: number },
  secret: string
): string {
  const payload = Buffer.from(
    JSON.stringify({
      u: claims.userId,
      l: claims.lessonId,
      q: claims.questionId,
      a: claims.answer,
      t: claims.attemptId,
      iat: claims.issuedAt ?? Math.floor(Date.now() / 1000),
    }),
    'utf8'
  ).toString('base64url')
  return `${payload}.${mac(secret, payload).toString('base64url')}`
}

const BASE64URL = /^[A-Za-z0-9_-]+$/

function readClaims(payload: string): QuizReceiptClaims | null {
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { u, l, q, a, t, iat } = raw as Record<string, unknown>
  if (typeof u !== 'string' || typeof l !== 'string' || typeof q !== 'string' || typeof t !== 'string') {
    return null
  }
  if (typeof a !== 'number' || !Number.isInteger(a) || a < 0 || a > 9) return null
  if (typeof iat !== 'number' || !Number.isInteger(iat)) return null
  return { userId: u, lessonId: l, questionId: q, answer: a, attemptId: t, issuedAt: iat }
}

/**
 * Verifies a receipt for this learner, lesson and attempt. The signature is checked before the
 * payload is trusted, in constant time.
 */
export function verifyQuizReceipt(
  receipt: string,
  expected: QuizReceiptContext,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): QuizReceiptVerdict {
  if (typeof receipt !== 'string' || receipt.length > QUIZ_RECEIPT_MAX_LENGTH) {
    return { ok: false, reason: 'malformed' }
  }
  const parts = receipt.split('.')
  if (parts.length !== 2 || !BASE64URL.test(parts[0]) || !BASE64URL.test(parts[1])) {
    return { ok: false, reason: 'malformed' }
  }
  const [payload, signature] = parts

  const given = Buffer.from(signature, 'base64url')
  const wanted = mac(secret, payload)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return { ok: false, reason: 'signature' }
  }

  const claims = readClaims(payload)
  if (!claims) return { ok: false, reason: 'malformed' }

  if (
    claims.userId !== expected.userId ||
    claims.lessonId !== expected.lessonId ||
    claims.attemptId !== expected.attemptId
  ) {
    return { ok: false, reason: 'mismatch' }
  }
  if (claims.issuedAt > nowSeconds + FUTURE_SKEW_SECONDS || nowSeconds - claims.issuedAt > QUIZ_RECEIPT_MAX_AGE_SECONDS) {
    return { ok: false, reason: 'expired' }
  }
  return { ok: true, claims }
}

interface SubmittedAnswer {
  question_id: string
  selected_option: number
}

export interface ReceiptedAnswers<T extends SubmittedAnswer> {
  /** The submitted answers, with each receipted question's answer replaced by the receipt's. */
  attempts: T[]
  /** Questions whose submitted answer differed from the receipt and was replaced. */
  replaced: number
  /** Receipts that failed verification, or that conflict with another receipt for the same question. */
  invalid: number
  /** Submitted questions that carry a valid receipt. */
  covered: number
  /** Ids of the submitted questions that carry a valid receipt. */
  receiptedQuestionIds: ReadonlySet<string>
}

/**
 * Applies check receipts to a quiz submission. A question with a valid receipt for this
 * learner, lesson and attempt is scored from the receipt; a question without one keeps the
 * submitted answer (offline fallback, older clients). A receipt for a question that is not in
 * the submission is ignored. Without an attempt id every receipt is invalid.
 */
export function applyQuizReceipts<T extends SubmittedAnswer>(
  attempts: T[],
  receipts: readonly string[],
  context: { userId: string; lessonId: string; attemptId: string | undefined },
  secret: string,
  nowSeconds?: number
): ReceiptedAnswers<T> {
  const checked = new Map<string, number>()
  let invalid = 0

  for (const receipt of receipts) {
    if (!context.attemptId) {
      invalid++
      continue
    }
    const verdict = verifyQuizReceipt(
      receipt,
      { userId: context.userId, lessonId: context.lessonId, attemptId: context.attemptId },
      secret,
      nowSeconds
    )
    if (!verdict.ok) {
      invalid++
      continue
    }
    const { questionId, answer } = verdict.claims
    const earlier = checked.get(questionId)
    if (earlier === undefined) {
      checked.set(questionId, answer)
    } else if (earlier !== answer) {
      // One check per (attempt, question) means two different signed answers should not exist.
      // Keep the first and treat the other as suspect.
      invalid++
    }
  }

  let replaced = 0
  const receiptedQuestionIds = new Set<string>()
  const applied = attempts.map((a) => {
    const signed = checked.get(a.question_id)
    if (signed === undefined) return a
    receiptedQuestionIds.add(a.question_id)
    if (signed === a.selected_option) return a
    replaced++
    return { ...a, selected_option: signed }
  })

  return { attempts: applied, replaced, invalid, covered: receiptedQuestionIds.size, receiptedQuestionIds }
}

/**
 * The check record window. The record lives in `rate_limits` and is written through the
 * persistent limiter (consume_rate_limit), whose window is fixed: `last_requested_at` is the
 * start of the live window and is not moved by later checks inside it. A check at time t
 * therefore always leaves `last_requested_at >= t - window`.
 */
export const QUIZ_CHECK_RECORD_WINDOW_MS = 2 * 60 * 60 * 1000

/**
 * How far back the submit looks for a record: two windows. By the rule above this covers every
 * check made in the last QUIZ_CHECK_RECORD_WINDOW_MS (2 hours), and some made up to 4 hours ago.
 */
export const QUIZ_CHECK_RECORD_LOOKBACK_MS = 2 * QUIZ_CHECK_RECORD_WINDOW_MS

/**
 * The limit passed with the record. It only has to be unreachable so the record never blocks a
 * check: the per-attempt rule (1) and the hourly cap (450) on the check route are far below it.
 */
export const QUIZ_CHECK_RECORD_LIMIT = 1_000_000

/** The limiter key that records "this learner checked this question". Attempt-independent. */
export function quizCheckRecordKey(userId: string, questionId: string): string {
  return `lesson_quiz_checked_${userId}_${questionId}`
}

/**
 * The questions, among `questionIds`, that this learner checked recently (a record within the
 * lookback). One read of `rate_limits` with the service-role client. Returns null when the read
 * fails, so the caller can fail open.
 */
export async function findRecentlyCheckedQuestions(
  supabase: Pick<SupabaseClient<Database>, 'from'>,
  userId: string,
  questionIds: readonly string[],
  nowMs: number = Date.now()
): Promise<Set<string> | null> {
  const found = new Set<string>()
  if (questionIds.length === 0) return found

  const byKey = new Map(questionIds.map((id) => [quizCheckRecordKey(userId, id), id]))
  try {
    const { data, error } = await supabase
      .from('rate_limits')
      .select('key, last_requested_at')
      .in('key', [...byKey.keys()])
      .gte('last_requested_at', new Date(nowMs - QUIZ_CHECK_RECORD_LOOKBACK_MS).toISOString())
    if (error || !Array.isArray(data)) return null
    for (const row of data) {
      const questionId = byKey.get(row.key)
      if (questionId) found.add(questionId)
    }
    return found
  } catch {
    return null
  }
}
