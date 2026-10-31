/**
 * GET  /api/v2/lessons/[lessonId]/progress
 * PATCH /api/v2/lessons/[lessonId]/progress
 *
 * Fetches or updates lesson progress for the authenticated user.
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column
 * (renamed from lesson_slug in migration 20260802000001).
 *
 * The v1 `[slug]` progress routes were removed (docs/API_CONTRACT.md); this is the only one.
 *
 * SEC-08 / CRIT1: any progress row makes the lesson count as "opened", which the access check
 * then grandfathers in. So PATCH rejects a malformed id (400) and a locked lesson (403) before it
 * writes, or it would unlock any lesson for the quiz and theory-read routes.
 *
 * CQ-11: every PATCH answers with the learner's progress row, and no write can move a completed
 * lesson back to in_progress (the downgrade guard is part of the UPDATE, not a prior read).
 */

import { after } from 'next/server'
import { z } from 'zod'

import { isLessonIdFormat } from '@/lib/academy/lesson-ids'
import { assertLessonAccessible } from '@/lib/academy/lessons-db'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { trackProductEvent } from '@/lib/events/product-events'
import { createServiceRoleClient, type Database } from '@/lib/supabase'

// Two mutually-exclusive PATCH shapes: the existing "mark in progress", and the Phase 4
// (§4.4) idempotent "deep dive opened" marker. Kept as a union so each call declares its
// intent explicitly and neither can smuggle the other's field.
const patchSchema = z.union([
  z.object({ status: z.literal('in_progress') }),
  z.object({ deep_dive_opened: z.literal(true) }),
])

type ProgressTable = Database['public']['Tables']['user_lesson_progress']
type ProgressRow = ProgressTable['Row']
type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** The ad-hoc 401 probe these three v2 routes carried, preserved through the wrapper. */
const warnUnauthorized = () => {
  console.warn('[auth-401-monitor] 401 Unauthorized in API v2')
}

/** The learner's progress row, or null when none exists. Database faults throw. */
async function findProgress(
  supabase: ServiceClient,
  userId: string,
  lessonId: string
): Promise<ProgressRow | null> {
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** The learner's progress row after a write that left it in place. */
async function readProgress(supabase: ServiceClient, userId: string, lessonId: string): Promise<ProgressRow> {
  const row = await findProgress(supabase, userId, lessonId)
  if (!row) {
    throw new Error(`[api/v2/lessons/progress] progress row for ${lessonId} missing after write`)
  }
  return row
}

/**
 * Inserts the learner's progress row only when none exists (ON CONFLICT DO NOTHING).
 * Returns the new row, or null when a row was already there. This is also the one reliable
 * signal that the learner just started the lesson.
 */
async function insertProgressIfMissing(
  supabase: ServiceClient,
  userId: string,
  lessonId: string,
  fields: Omit<ProgressTable['Insert'], 'user_id' | 'lesson_id'>
): Promise<ProgressRow | null> {
  const { data, error } = await supabase
    .from('user_lesson_progress')
    .upsert(
      { ...fields, user_id: userId, lesson_id: lessonId },
      { onConflict: 'user_id,lesson_id', ignoreDuplicates: true }
    )
    .select()
  if (error) throw error
  return data?.[0] ?? null
}

/** PROD-15: recorded after the response; trackProductEvent never throws. */
function recordLessonStarted(userId: string, lessonId: string): void {
  after(() => trackProductEvent('lesson_started', userId, { lesson_id: lessonId }))
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

    const progress = await findProgress(serviceSupabase, userId, lessonId)

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
        deep_dive_opened_at: null,
      } satisfies ProgressRow)
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

    if (!isLessonIdFormat(lessonId)) {
      throw new RouteError(400, 'VALIDATION', 'Invalid lesson id.')
    }

    // CQ-12: a malformed body is the caller's mistake (400), not an incident.
    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid request body. JSON object expected.')
    }
    const parsed = patchSchema.safeParse(raw)
    if (!parsed.success) {
      throw new RouteError(400, 'VALIDATION', 'Body must be {status:"in_progress"} or {deep_dive_opened:true}.')
    }

    const serviceSupabase = createServiceRoleClient()

    // CRIT1: before any write. Unknown lesson -> 404, locked lesson -> 403 (PublicError).
    await assertLessonAccessible(serviceSupabase, userId, lessonId)

    // Phase 4 (§4.4): first Deep-dive open. Idempotent: the timestamp is set once and never
    // overwritten, so re-opening the section does not reset the marker. Only this column is
    // written, leaving status/theory/quiz state untouched.
    if ('deep_dive_opened' in parsed.data) {
      const openedAt = new Date().toISOString()
      const created = await insertProgressIfMissing(serviceSupabase, userId, lessonId, {
        deep_dive_opened_at: openedAt,
      })
      if (created) {
        recordLessonStarted(userId, lessonId)
        return Response.json(created)
      }

      const { data: updated, error } = await serviceSupabase
        .from('user_lesson_progress')
        .update({ deep_dive_opened_at: openedAt })
        .eq('user_id', userId)
        .eq('lesson_id', lessonId)
        .is('deep_dive_opened_at', null)
        .select()
        .maybeSingle()
      if (error) throw error

      return Response.json(updated ?? (await readProgress(serviceSupabase, userId, lessonId)))
    }

    const created = await insertProgressIfMissing(serviceSupabase, userId, lessonId, {
      status: 'in_progress',
    })
    if (created) {
      recordLessonStarted(userId, lessonId)
      return Response.json(created)
    }

    // Never downgrade: the `neq` makes the guard atomic, so a quiz completing between two
    // calls (or a second tab) cannot be overwritten. A completed row is returned unchanged.
    const { data: updated, error } = await serviceSupabase
      .from('user_lesson_progress')
      .update({ status: 'in_progress' })
      .eq('user_id', userId)
      .eq('lesson_id', lessonId)
      .neq('status', 'completed')
      .select()
      .maybeSingle()
    if (error) throw error

    return Response.json(updated ?? (await readProgress(serviceSupabase, userId, lessonId)))
  }
)
