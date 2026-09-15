/**
 * POST /api/v2/lessons/[lessonId]/theory-read
 *
 * Records that the authenticated user has completed the theory section of a lesson.
 * Validates engagement thresholds, awards XP, and updates the streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/theory-read.
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
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
  },
  async ({ actor, body, params }) => {
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
