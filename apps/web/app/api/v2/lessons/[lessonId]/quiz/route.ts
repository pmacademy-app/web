/**
 * POST /api/v2/lessons/[lessonId]/quiz
 *
 * Records quiz attempt for the authenticated user, awards XP,
 * marks lesson complete, and updates streak.
 *
 * Uses stable les_XXXXXX IDs and queries the `lesson_id` column.
 * v2 counterpart to /api/lessons/[slug]/quiz.
 */

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordQuizAttemptAction } from '@/lib/lessons-db'

const quizAttemptSchema = z.object({
  attempts: z.array(z.object({
    question_id: z.string(),
    selected_option: z.number().int().min(0).max(3),
    is_correct: z.boolean(),
  })).min(1),
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
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authClient = createAuthenticatedServerClient(accessToken)
    const user = await getAuthenticatedUser(authClient)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = quizAttemptSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { attempts } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    const result = await recordQuizAttemptAction(
      serviceSupabase,
      user.id,
      lessonId,
      attempts
    )

    return Response.json(result)
  } catch (err) {
    console.error('[api/v2/lessons/[lessonId]/quiz POST]', err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json({ error: errorMsg }, { status: 500 })
  }
}
