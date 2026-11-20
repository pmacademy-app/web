/**
 * GET  /api/reflections?lesson_id=<lessonId>
 * POST /api/reflections
 *
 * Fetches or creates/updates a reflection for the authenticated user.
 * Updated for v2 migration: uses `lesson_id` column (renamed from lesson_slug).
 *
 * Accepts both stable les_XXXXXX IDs (v2) and legacy slug strings (v1 backward compat).
 */

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { reflectionWriteBodySchema } from '@/lib/api/contracts/learner-writes'
import { recordReflectionAction } from '@/lib/lessons-db'
import { createServiceRoleClient } from '@/lib/supabase'
import { revalidatePublicPortfolioForUser } from '@/lib/portfolio-revalidate'
import { logSystemError } from '@/lib/monitoring/logger'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'reflections.read',
    summary: 'Unexpected failure loading a reflection',
  },
  async ({ request, actor }) => {
    const { searchParams } = new URL(request.url)
    // Accept both ?lesson_id= (v2) and legacy ?lesson_slug= (v1 backward compat)
    const lessonId = searchParams.get('lesson_id') || searchParams.get('lesson_slug')

    if (!lessonId) {
      throw new RouteError(400, 'VALIDATION', 'Missing lesson_id query parameter')
    }

    const serviceSupabase = createServiceRoleClient()
    const { data: reflection, error } = await serviceSupabase
      .from('reflections')
      .select('*')
      .eq('user_id', requireUserId(actor))
      .eq('lesson_id', lessonId)
      .maybeSingle()

    if (error) {
      void logSystemError({
        severity: 'error',
        category: 'db',
        operation: 'reflections.get',
        message: `Error loading reflection: ${error.message}`,
        userId: requireUserId(actor),
        details: { lessonId, error: error.message },
      })
      throw new RouteError(500, 'SERVER_ERROR', 'Database error')
    }

    // The lesson page reads `data.content` and `data.is_public` off the top level,
    // so the bare row (or null) stays the success shape.
    return Response.json(reflection || null)
  }
)

/** Lesson id prefix of a capstone reflection, the only kind the public portfolio shows. */
const CAPSTONE_REFLECTION_PREFIX = 'capstone-'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'reflections.write',
    summary: 'Unexpected failure saving a reflection',
    // N-4: an authenticated write with no ceiling before this batch. 20/hour is far
    // above the one-per-lesson pace of real use and still bounds a scripted flood.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `reflections_write_${actor.userId}` : null),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      },
    ],
    // Strict (it is written into a row); a legacy `lesson_slug` is folded into
    // `lesson_id` by the schema, so v1 clients keep working.
    body: reflectionWriteBodySchema,
  },
  async ({ body, actor }) => {
    const { lesson_id, content, is_public } = body
    const serviceSupabase = createServiceRoleClient()

    const result = await recordReflectionAction(
      serviceSupabase,
      requireUserId(actor),
      lesson_id,
      content,
      is_public
    )

    // Only capstone reflections (`capstone-<slug>`) appear on the cached public portfolio, so
    // only they purge it, public or not: a reflection made private must leave the page too.
    if (lesson_id.startsWith(CAPSTONE_REFLECTION_PREFIX)) {
      await revalidatePublicPortfolioForUser(serviceSupabase, requireUserId(actor), [
        lesson_id.slice(CAPSTONE_REFLECTION_PREFIX.length),
      ])
    }

    return Response.json(result)
  }
)
