/**
 * POST /api/v2/lessons/[lessonId]/feedback
 * GET  /api/v2/lessons/[lessonId]/feedback
 *
 * Phase 6 — Lesson Feedback & Rating Loop.
 * Allows authenticated learners to submit a 1-5 clarity rating, clarity tags,
 * and an optional comment for a specific lesson.
 * Rate-limited to 1 submission per user per lesson per 24 hours.
 */

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import {
  recordLessonFeedback,
  getLearnerLessonFeedback,
  getLessonQualityMetrics,
} from '@/lib/feedback/lesson-feedback-service'

const feedbackBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string()).optional(),
  comment: z.string().max(500).optional().nullable(),
})

interface RouteContext {
  params: Promise<{ lessonId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { lessonId } = await params
    if (!lessonId || !lessonId.trim()) {
      return Response.json({ error: 'Valid lesson ID is required.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    if (!accessToken) {
      return Response.json(
        { error: 'Unauthorized. You must be signed in to rate lessons.' },
        { status: 401 }
      )
    }

    const authClient = createAuthenticatedServerClient(accessToken)
    const user = await getAuthenticatedUser(authClient)
    if (!user) {
      return Response.json(
        { error: 'Unauthorized. Invalid or expired session.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const parsed = feedbackBodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid feedback data. Rating must be an integer between 1 and 5.' },
        { status: 400 }
      )
    }

    const serviceSupabase = createServiceRoleClient()
    const result = await recordLessonFeedback(
      serviceSupabase,
      user.id,
      lessonId,
      parsed.data
    )

    return Response.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record lesson feedback.'
    console.error('[POST /api/v2/lessons/[lessonId]/feedback] Error:', err)
    return Response.json({ error: message }, { status: 400 })
  }
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { lessonId } = await params
    if (!lessonId || !lessonId.trim()) {
      return Response.json({ error: 'Valid lesson ID is required.' }, { status: 400 })
    }

    const serviceSupabase = createServiceRoleClient()
    const metrics = await getLessonQualityMetrics(serviceSupabase, lessonId)

    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-access-token')?.value

    let userFeedback = null
    if (accessToken) {
      const authClient = createAuthenticatedServerClient(accessToken)
      const user = await getAuthenticatedUser(authClient)
      if (user) {
        userFeedback = await getLearnerLessonFeedback(serviceSupabase, user.id, lessonId)
      }
    }

    return Response.json({
      success: true,
      feedback: userFeedback,
      metrics,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch lesson feedback.'
    console.error('[GET /api/v2/lessons/[lessonId]/feedback] Error:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
