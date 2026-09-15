/**
 * GET  /api/v2/lessons/[lessonId]/progress
 * PATCH /api/v2/lessons/[lessonId]/progress
 *
 * Fetches or updates lesson progress for the authenticated user.
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column
 * (renamed from lesson_slug in migration 20260802000001).
 *
 * This is the v2 counterpart to /api/lessons/[slug]/progress.
 * The [slug] routes remain active for the v1 lesson page (Phase 1.4 removes them).
 */

import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

const patchSchema = z.object({
  status: z.literal('in_progress'),
})

interface ProgressRow {
  user_id: string
  lesson_id: string
  status: 'not_started' | 'in_progress' | 'completed'
  theory_read_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  xp_earned: number
  completed_at: string | null
}

interface SupabaseTable {
  upsert: (data: unknown, options?: unknown) => {
    select: () => {
      single: () => Promise<{ data: unknown; error: unknown }>
    }
  }
}

/** The ad-hoc 401 probe these three v2 routes carried, preserved through the wrapper. */
const warnUnauthorized = () => {
  console.warn('[auth-401-monitor] 401 Unauthorized in API v2')
}

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.progress.read',
    summary: 'Unexpected failure fetching lesson progress',
    onDenied: warnUnauthorized,
  },
  async ({ actor, params }) => {
    const userId = requireUserId(actor)
    const lessonId = params.lessonId
    const serviceSupabase = createServiceRoleClient()

    const { data: progress, error } = (await serviceSupabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

    if (error) {
      console.error(`[api/v2/lessons/${lessonId}/progress] Error fetching progress:`, error)
      throw new RouteError(500, 'SERVER_ERROR', 'Database error')
    }

    if (!progress) {
      return Response.json({
        user_id: userId,
        lesson_id: lessonId,
        status: 'not_started',
        theory_read_at: null,
        quiz_score: null,
        quiz_attempts: 0,
        xp_earned: 0,
        completed_at: null,
      })
    }

    return Response.json(progress)
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'v2.lessons.progress.update',
    summary: 'Unexpected failure updating lesson progress',
    // 30/min per learner, as before. The body is parsed inside the handler rather
    // than declared here on purpose: the wrapper validates before it throttles, and
    // this route charged the bucket first. Keeping that order means a flood of
    // malformed bodies is still counted against the limit.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `progress_${actor.userId}` : null),
        limit: 30,
        windowMs: 60 * 1000,
      },
    ],
  },
  async ({ request, actor, params }) => {
    const userId = requireUserId(actor)
    const lessonId = params.lessonId

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      throw new RouteError(400, 'VALIDATION', 'status must be "in_progress".')
    }

    const { status } = parsed.data
    const serviceSupabase = createServiceRoleClient()

    // Query current status to prevent overriding a completed state with in_progress
    const { data: existing } = (await serviceSupabase
      .from('user_lesson_progress')
      .select('status')
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .maybeSingle()) as unknown as { data: { status: string } | null; error: unknown }

    if (existing?.status === 'completed' && status === 'in_progress') {
      return Response.json({ message: 'Already completed, update ignored.' })
    }

    const { data: updated, error } = (await (serviceSupabase
      .from('user_lesson_progress') as unknown as SupabaseTable)
      .upsert({
        user_id: userId,
        lesson_id: lessonId,
        status,
      }, { onConflict: 'user_id,lesson_id' })
      .select()
      .single()) as unknown as { data: ProgressRow | null; error: unknown }

    if (error) {
      console.error(`[api/v2/lessons/${lessonId}/progress] Error upserting progress:`, error)
      throw new RouteError(500, 'SERVER_ERROR', 'Database error')
    }

    return Response.json(updated)
  }
)
