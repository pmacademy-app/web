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

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { getAuthenticatedUser } from '@/lib/auth'

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authClient = createAuthenticatedServerClient(accessToken)
    const user = await getAuthenticatedUser(authClient)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceSupabase = createServerSupabaseClient()
    const { data: progress, error } = (await serviceSupabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .maybeSingle()) as unknown as { data: ProgressRow | null; error: unknown }

    if (error) {
      console.error(`[api/v2/lessons/${lessonId}/progress] Error fetching progress:`, error)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    if (!progress) {
      return Response.json({
        user_id: user.id,
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
  } catch (err) {
    console.error('[api/v2/lessons/[lessonId]/progress GET]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authClient = createAuthenticatedServerClient(accessToken)
    const user = await getAuthenticatedUser(authClient)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting (30 requests per minute per user)
    const rl = evaluateRateLimit(`progress_${user.id}`, { limit: 30, windowMs: 60 * 1000 })
    if (!rl.success) {
      return Response.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 })
    }

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { status } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    // Query current status to prevent overriding a completed state with in_progress
    const { data: existing } = (await serviceSupabase
      .from('user_lesson_progress')
      .select('status')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .maybeSingle()) as unknown as { data: { status: string } | null; error: unknown }

    if (existing?.status === 'completed' && status === 'in_progress') {
      return Response.json({ message: 'Already completed, update ignored.' })
    }

    const { data: updated, error } = (await (serviceSupabase
      .from('user_lesson_progress') as unknown as SupabaseTable)
      .upsert({
        user_id: user.id,
        lesson_id: lessonId,
        status,
      }, { onConflict: 'user_id,lesson_id' })
      .select()
      .single()) as unknown as { data: ProgressRow | null; error: unknown }

    if (error) {
      console.error(`[api/v2/lessons/${lessonId}/progress] Error upserting progress:`, error)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    return Response.json(updated)
  } catch (err) {
    console.error('[api/v2/lessons/[lessonId]/progress PATCH]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
