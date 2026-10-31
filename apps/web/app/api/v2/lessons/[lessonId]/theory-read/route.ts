/**
 * POST /api/v2/lessons/[lessonId]/theory-read
 *
 * Records that the authenticated user has completed the theory section of a lesson.
 * Validates engagement thresholds, awards XP, and updates the streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/theory-read.
 *
 * SEC-08: an unknown lesson id is a 404 and a locked lesson a 403 (both enforced in
 * `recordTheoryReadAction`, before any write).
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { isLessonIdFormat } from '@/lib/academy/lesson-ids'
import { recordTheoryReadAction } from '@/lib/lessons-db'
import { createServiceRoleClient } from '@/lib/supabase'

const theoryReadSchema = z.object({
  active_seconds: z.number().int().min(0),
  scroll_percentage: z.number().min(0).max(100),
})

/** The ad-hoc 401 probe these three v2 routes carried, preserved through the wrapper. */
const warnUnauthorized = () => {
  console.warn('[auth-401-monitor] 401 Unauthorized in API v2')
}

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.theory_read',
    summary: 'Unexpected failure recording a theory read',
    body: theoryReadSchema,
    onDenied: warnUnauthorized,
    // SEC-08: theory XP is awarded once per lesson, so a learner needs at most a handful of
    // calls per lesson. 60 an hour per learner leaves room for retries after a failed gate.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `lesson_theory_read_${actor.userId}` : null),
        limit: 60,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body, params }) => {
    if (!isLessonIdFormat(params.lessonId)) {
      throw new RouteError(404, 'NOT_FOUND', 'Lesson not found.')
    }

    const serviceSupabase = createServiceRoleClient()

    const result = await recordTheoryReadAction(
      serviceSupabase,
      requireUserId(actor),
      params.lessonId,
      body.active_seconds,
      body.scroll_percentage
    )

    return Response.json(result)
  }
)
