/**
 * POST /api/v2/lessons/[lessonId]/quiz
 *
 * Records quiz attempt for the authenticated user, awards XP,
 * marks lesson complete, and updates streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/quiz.
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { recordQuizAttemptAction } from '@/lib/lessons-db'
import { createServiceRoleClient } from '@/lib/supabase'

const quizAttemptSchema = z.object({
  attempts: z.array(z.object({
    question_id: z.string(),
    selected_option: z.number().int().min(0).max(3),
    is_correct: z.boolean().optional(),
  })).min(1),
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
  },
  async ({ actor, body, params }) => {
    const serviceSupabase = createServiceRoleClient()

    // Pass only the necessary fields to the service action so correctness validation is strictly server-side
    const cleanAttempts = body.attempts.map((a) => ({
      question_id: a.question_id,
      selected_option: a.selected_option,
    }))

    const result = await recordQuizAttemptAction(
      serviceSupabase,
      requireUserId(actor),
      params.lessonId,
      cleanAttempts
    )

    return Response.json(result)
  }
)
