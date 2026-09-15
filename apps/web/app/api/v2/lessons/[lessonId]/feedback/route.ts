/**
 * POST /api/v2/lessons/[lessonId]/feedback
 * GET  /api/v2/lessons/[lessonId]/feedback
 *
 * Phase 6 — Lesson Feedback & Rating Loop.
 * Allows authenticated learners to submit a 1-5 clarity rating, clarity tags,
 * and an optional comment for a specific lesson.
 * Rate-limited to 1 submission per user per lesson per 24 hours.
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import {
  recordLessonFeedback,
  getLearnerLessonFeedback,
  getLessonQualityMetrics,
} from '@/lib/feedback/lesson-feedback-service'
import { createServiceRoleClient } from '@/lib/supabase'

const feedbackBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().max(500).optional().nullable(),
}, { message: 'Invalid feedback data. Rating must be an integer between 1 and 5.' })

function requireLessonId(params: Record<string, string>): string {
  const lessonId = params.lessonId
  if (!lessonId || !lessonId.trim()) {
    throw new RouteError(400, 'VALIDATION', 'Valid lesson ID is required.')
  }
  return lessonId
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.feedback.submit',
    summary: 'Unexpected failure recording lesson feedback',
    body: feedbackBodySchema,
  },
  async ({ actor, body, params }) => {
    const lessonId = requireLessonId(params)
    const serviceSupabase = createServiceRoleClient()
    const result = await recordLessonFeedback(serviceSupabase, requireUserId(actor), lessonId, body)

    return Response.json(result)
  }
)

/**
 * Deliberately open to `anonymous`.
 *
 * Quality metrics for a lesson are public; only the `feedback` field is
 * caller-specific, and it stays `null` for a caller the wrapper resolved as
 * anonymous. That is exactly what this route did before migration — it read the
 * session opportunistically and degraded instead of refusing.
 */
export const GET = withRoute(
  {
    actor: { allow: ['learner', 'anonymous'] },
    operation: 'v2.lessons.feedback.read',
    summary: 'Unexpected failure fetching lesson feedback',
  },
  async ({ actor, params }) => {
    const lessonId = requireLessonId(params)
    const serviceSupabase = createServiceRoleClient()
    const metrics = await getLessonQualityMetrics(serviceSupabase, lessonId)

    const userFeedback =
      actor.kind === 'learner'
        ? await getLearnerLessonFeedback(serviceSupabase, actor.userId, lessonId)
        : null

    return Response.json({ success: true, feedback: userFeedback, metrics })
  }
)
