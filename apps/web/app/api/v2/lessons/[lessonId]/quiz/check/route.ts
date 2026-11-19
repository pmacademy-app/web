/**
 * POST /api/v2/lessons/[lessonId]/quiz/check
 *
 * Checks one quiz answer and reveals that question's correct option and explanation.
 *
 * The lesson page sends quiz questions without `correctAnswer` or `explanation`
 * (lib/academy/client-lesson.ts), so this is the only way the browser learns them, and only
 * after the learner has committed an answer.
 *
 * One check per (learner, attempt, question): the attempt id is a random id the quiz block
 * creates when an attempt starts, and the limiter key includes it with a limit of 1, so a
 * second check of the same question in the same attempt is a 429. Trying every option of a
 * question therefore needs a new attempt, which is what "Retry Quiz" already offers after the
 * answer has been shown. A per-learner hourly cap stops a script from minting attempt ids to
 * flood the limiter table.
 *
 * Scoring is not done here: the final submit (POST ../quiz) rescores every answer on the
 * server from the compiled lesson. When QUIZ_RECEIPT_SECRET is set the response also carries a
 * signed `receipt` of the checked answer (lib/academy/quiz-receipts.ts), and the submit scores
 * that answer for this question, so learning the right option here cannot change the score.
 * With the secret set the route also records that this learner checked this question (an
 * attempt-independent `lesson_quiz_checked_<userId>_<questionId>` row in the persistent limiter
 * table, written after every gate has passed and before the answer is returned). A submit that
 * leaves this question's receipt out scores it as incorrect while that record is recent.
 * Without the secret no receipt is issued, nothing is recorded and the response is as before.
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { isLessonIdFormat, QUIZ_QUESTION_ID_PATTERN } from '@/lib/academy/lesson-ids'
import { assertLessonAccessible } from '@/lib/academy/lessons-db'
import {
  getQuizReceiptSecret,
  QUIZ_ATTEMPT_ID_PATTERN,
  QUIZ_CHECK_RECORD_LIMIT,
  QUIZ_CHECK_RECORD_WINDOW_MS,
  quizCheckRecordKey,
  signQuizReceipt,
} from '@/lib/academy/quiz-receipts'
import { fetchCompiledLesson } from '@/lib/lesson-loader'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { recordSecurityEvent } from '@/lib/security/security-events'
import { createServiceRoleClient } from '@/lib/supabase'
import type { CompiledQuizQuestion } from '@/types'

/** How long one (attempt, question) check stays spent. Attempt ids are random, so this only bounds reuse. */
const QUIZ_CHECK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Per-learner cap: 30 submits an hour (the submit route's limit) times a 15-question bank. */
const QUIZ_CHECK_HOURLY_LIMIT = 450

const quizCheckSchema = z.object({
  questionId: z.string().max(64).regex(QUIZ_QUESTION_ID_PATTERN, 'Invalid question id.'),
  answer: z.number().int().min(0).max(9),
  attemptId: z.string().regex(QUIZ_ATTEMPT_ID_PATTERN, 'Invalid attempt id.'),
})

type QuizCheckBody = z.infer<typeof quizCheckSchema>

const QUESTION_NOT_FOUND = 'Question not found.'

function learnerId(actor: { kind: string; userId?: string }): string | null {
  return actor.kind === 'learner' && actor.userId ? actor.userId : null
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.quiz.check',
    summary: 'Unexpected failure checking a quiz answer',
    body: quizCheckSchema,
    rateLimit: [
      {
        // The question id embeds its lesson id (q-les_xxx-N), so the key is unique per
        // lesson without reading the path.
        key: ({ actor, body }) => {
          const userId = learnerId(actor)
          if (!userId) return null
          const { attemptId, questionId } = body as QuizCheckBody
          return `lesson_quiz_check_${userId}_${attemptId}_${questionId}`
        },
        limit: 1,
        windowMs: QUIZ_CHECK_WINDOW_MS,
      },
      {
        key: ({ actor }) => {
          const userId = learnerId(actor)
          return userId ? `lesson_quiz_check_hourly_${userId}` : null
        },
        limit: QUIZ_CHECK_HOURLY_LIMIT,
        windowMs: 60 * 60 * 1000,
      },
    ],
    onRateLimited: ({ request, actor }) => recordSecurityEvent('quiz_check_rate_limited', { subject: learnerId(actor), path: request.url }),
  },
  async ({ actor, body, params }) => {
    const lessonId = params.lessonId
    if (!isLessonIdFormat(lessonId)) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }

    // A question id from another lesson is unknown here, not a different lesson's answer.
    const questionLesson = QUIZ_QUESTION_ID_PATTERN.exec(body.questionId)?.[1]
    if (questionLesson !== lessonId) {
      throw new RouteError(404, 'NOT_FOUND', QUESTION_NOT_FOUND)
    }

    const lesson = await fetchCompiledLesson(lessonId)
    if (!lesson) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }

    // The full bank, as the submit route scores it: a recut learner's served sample is a
    // subset, and accepting the bank keeps a variant flip between render and check harmless.
    const quizBlock = lesson.blocks.find((b) => b.type === 'quiz')
    const question = ((quizBlock?.questions ?? []) as CompiledQuizQuestion[]).find(
      (q) => q.id === body.questionId
    )
    if (!question) {
      throw new RouteError(404, 'NOT_FOUND', QUESTION_NOT_FOUND)
    }
    if (body.answer >= question.options.length) {
      throw new RouteError(400, 'VALIDATION', 'Answer is not one of the options.')
    }

    // A locked lesson's answers are not revealed (403 LESSON_LOCKED from the shared check).
    const userId = requireUserId(actor)
    await assertLessonAccessible(createServiceRoleClient(), userId, lessonId)

    const secret = getQuizReceiptSecret()
    if (secret) {
      // A record, not a limit: the limit is unreachable, so the decision is ignored. If the
      // limiter is down it degrades to the in-memory counter, which leaves no record, and the
      // submit then scores this question from the submitted answer (no penalty).
      try {
        await evaluatePersistentRateLimit(quizCheckRecordKey(userId, question.id), {
          limit: QUIZ_CHECK_RECORD_LIMIT,
          windowMs: QUIZ_CHECK_RECORD_WINDOW_MS,
        })
      } catch {
        // Never let the record decide whether the learner gets their result.
      }
    }
    const receipt = secret
      ? signQuizReceipt(
          { userId, lessonId, questionId: question.id, answer: body.answer, attemptId: body.attemptId },
          secret
        )
      : undefined

    return Response.json(
      {
        correct: body.answer === question.correctAnswer,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation ?? '',
        ...(receipt ? { receipt } : {}),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
)
