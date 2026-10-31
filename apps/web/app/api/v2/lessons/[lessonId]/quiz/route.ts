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
 */

import { after } from 'next/server'
import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { isLessonIdFormat, MAX_QUIZ_ATTEMPTS, QUIZ_QUESTION_ID_PATTERN } from '@/lib/academy/lesson-ids'
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
    const cleanAttempts = body.attempts.map((a) => ({
      question_id: a.question_id,
      selected_option: a.selected_option,
    }))

    const userId = requireUserId(actor)

    const result = await submitQuizAttempt(
      serviceSupabase,
      userId,
      params.lessonId,
      cleanAttempts
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
