/**
 * POST /api/v2/lessons/[lessonId]/theory-read
 *
 * Records that the authenticated user has completed the theory section of a lesson.
 * Validates engagement thresholds, awards XP, and updates the streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/theory-read.
 */

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordTheoryReadAction } from '@/lib/lessons-db'

const theoryReadSchema = z.object({
  active_seconds: z.number().int().min(0),
  scroll_percentage: z.number().min(0).max(100),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await params
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      { console.warn('[auth-401-monitor] 401 Unauthorized in API v2'); return Response.json({ error: 'Unauthorized' }, { status: 401 }); }
    }

    const authClient = createAuthenticatedServerClient(accessToken)
    const user = await getAuthenticatedUser(authClient)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = theoryReadSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { active_seconds, scroll_percentage } = parsed.data
    const serviceSupabase = createServiceRoleClient()

    const result = await recordTheoryReadAction(
      serviceSupabase,
      user.id,
      lessonId,
      active_seconds,
      scroll_percentage
    )

    return Response.json(result)
  } catch (err) {
    console.error('[api/v2/lessons/[lessonId]/theory-read POST]', err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json({ error: errorMsg }, { status: 500 })
  }
}
