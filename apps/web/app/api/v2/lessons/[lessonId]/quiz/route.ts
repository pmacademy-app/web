/**
 * POST /api/v2/lessons/[lessonId]/quiz
 *
 * Records quiz attempt for the authenticated user, awards XP,
 * marks lesson complete, and updates streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/quiz.
 *
 * SEC-08: the body is bounded, question ids are unique and well formed, the lesson id is
 * checked before it touches the filesystem, and `submitQuizAttempt` requires the answers to
 * cover exactly the served quiz on a lesson the learner can open, before any write.
 *
 * Quiz receipts (lib/academy/quiz-receipts.ts): the check route reveals a question's correct
 * option and, when QUIZ_RECEIPT_SECRET is set, signs the answer it checked. A question with a
 * valid receipt for this learner, lesson and attempt is scored from the receipt, whatever the
 * client now sends for it; a question without one is scored from the submitted answer (offline
 * fallback, older clients). An invalid or forged receipt is ignored and costs the first-attempt
 * perfect bonus. Without the secret receipts are ignored and scoring is as before.
 */

import { after } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { isLessonIdFormat, MAX_QUIZ_ATTEMPTS, QUIZ_QUESTION_ID_PATTERN } from '@/lib/academy/lesson-ids'
import {
  applyQuizReceipts,
  getQuizReceiptSecret,
  QUIZ_ATTEMPT_ID_PATTERN,
  QUIZ_RECEIPT_MAX_LENGTH,
} from '@/lib/academy/quiz-receipts'
import { submitQuizAttempt } from '@/lib/lessons-db'
import { trackProductEvent } from '@/lib/events/product-events'
import { createServiceRoleClient } from '@/lib/supabase'

const quizAttemptSchema = z.object({
  attempts: z
    .array(
      z.object({
        question_id: z.string().max(64).regex(QUIZ_QUESTION_ID_PATTERN, 'Invalid question id.'),
        selected_option: z.number().int().min(0).max(3),
        is_correct: z.boolean().optional(),
      })
    )
    .min(1)
    .max(MAX_QUIZ_ATTEMPTS)
    .refine(
      (attempts) => new Set(attempts.map((a) => a.question_id)).size === attempts.length,
      'Each question can be answered only once per submission.'
    ),
  /** The attempt id the quiz block sent with each check (absent from older clients). */
  attemptId: z.string().regex(QUIZ_ATTEMPT_ID_PATTERN, 'Invalid attempt id.').optional(),
  /** Signed receipts from the check route, one per checked question. */
  receipts: z.array(z.string().max(QUIZ_RECEIPT_MAX_LENGTH)).max(MAX_QUIZ_ATTEMPTS).optional(),
})

/** The ad-hoc 401 probe these three v2 routes carried, preserved through the wrapper. */
const warnUnauthorized = () => {
  console.warn('[auth-401-monitor] 401 Unauthorized in API v2')
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.quiz.submit',
    summary: 'Unexpected failure recording a quiz attempt',
    body: quizAttemptSchema,
    onDenied: warnUnauthorized,
    // SEC-08: retakes are legitimate but each one writes attempts and may award XP. 30 an
    // hour per learner is far above a real study session.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `lesson_quiz_${actor.userId}` : null),
        limit: 30,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body, params }) => {
    if (!isLessonIdFormat(params.lessonId)) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }

    const serviceSupabase = createServiceRoleClient()

    // Pass only the necessary fields to the service action so correctness validation is strictly server-side
    let cleanAttempts = body.attempts.map((a) => ({
      question_id: a.question_id,
      selected_option: a.selected_option,
    }))

    const userId = requireUserId(actor)

    // A checked question is scored from its signed receipt, not from the submitted answer.
    // With receipts on, the perfect bonus also needs a valid receipt for every submitted
    // question: leaving receipts out (to submit answers learned from the check) still scores,
    // but cannot earn the bonus. Without the secret, scoring and the bonus are as before.
    let denyPerfectBonus = false
    const secret = getQuizReceiptSecret()
    if (secret) {
      const receipted = applyQuizReceipts(
        cleanAttempts,
        body.receipts ?? [],
        { userId, lessonId: params.lessonId, attemptId: body.attemptId },
        secret
      )
      cleanAttempts = receipted.attempts
      if (receipted.invalid > 0) {
        denyPerfectBonus = true
        console.warn('[quiz-receipts] invalid receipt in quiz submission; perfect bonus withheld', { userId })
      } else if (receipted.covered < cleanAttempts.length) {
        denyPerfectBonus = true
      }
    }

    const result = await submitQuizAttempt(
      serviceSupabase,
      userId,
      params.lessonId,
      cleanAttempts,
      { denyPerfectBonus }
    )

    // PROD-15 / North Star: record quiz submission and lesson mastery events.
    after(async () => {
      await trackProductEvent('quiz_submitted', userId, {
        lesson_id: params.lessonId,
        score: result.scorePercentage,
        correct_count: result.correctCount,
        total_questions: result.totalQuestions,
      })

      if (result.isCompleted && result.scorePercentage >= 70) {
        await trackProductEvent('lesson_completed', userId, {
          lesson_id: params.lessonId,
          score: result.scorePercentage,
        })
      }
    })

    return Response.json(result)
  }
)
