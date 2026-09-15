/**
 * GET  /api/reflections?lesson_id=<lessonId>
 * POST /api/reflections
 *
 * Fetches or creates/updates a reflection for the authenticated user.
 * Updated for v2 migration: uses `lesson_id` column (renamed from lesson_slug).
 *
 * Accepts both stable les_XXXXXX IDs (v2) and legacy slug strings (v1 backward compat).
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { recordReflectionAction } from '@/lib/lessons-db'
import { createServiceRoleClient } from '@/lib/supabase'

const reflectionPostSchema = z.object({
  lesson_id: z.string(),  // accepts stable les_XXXXXX IDs or legacy slugs
  content: z.string().min(1, 'Reflection content cannot be empty'),
  is_public: z.boolean().default(false),
})

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
      console.error(`[api/reflections] Error loading reflection:`, error)
      throw new RouteError(500, 'SERVER_ERROR', 'Database error')
    }

    // The lesson page reads `data.content` and `data.is_public` off the top level,
    // so the bare row (or null) stays the success shape.
    return Response.json(reflection || null)
  }
)

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
  },
  async ({ request, actor }) => {
    const body = await request.json().catch(() => null)

    // Support both v2 (lesson_id) and legacy (lesson_slug) clients during transition
    const raw = (body ?? {}) as Record<string, unknown>
    const normalizedBody: Record<string, unknown> = { ...raw, lesson_id: raw.lesson_id ?? raw.lesson_slug }
    delete normalizedBody.lesson_slug

    const parsed = reflectionPostSchema.safeParse(normalizedBody)
    if (!parsed.success) {
      throw new RouteError(
        400,
        'VALIDATION',
        parsed.error.issues[0]?.message || 'Invalid reflection.'
      )
    }

    const { lesson_id, content, is_public } = parsed.data
    const serviceSupabase = createServiceRoleClient()

    const result = await recordReflectionAction(
      serviceSupabase,
      requireUserId(actor),
      lesson_id,
      content,
      is_public
    )

    return Response.json(result)
  }
)
