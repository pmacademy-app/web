/**
 * GET  /api/reflections?lesson_id=<lessonId>
 * POST /api/reflections
 *
 * Fetches or creates/updates a reflection for the authenticated user.
 * Updated for v2 migration: uses `lesson_id` column (renamed from lesson_slug).
 *
 * Accepts both stable les_XXXXXX IDs (v2) and legacy slug strings (v1 backward compat).
 */

import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordReflectionAction } from '@/lib/lessons-db'

const reflectionPostSchema = z.object({
  lesson_id: z.string(),  // accepts stable les_XXXXXX IDs or legacy slugs
  content: z.string().min(1, 'Reflection content cannot be empty'),
  is_public: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Accept both ?lesson_id= (v2) and legacy ?lesson_slug= (v1 backward compat)
    const lessonId = searchParams.get('lesson_id') || searchParams.get('lesson_slug')

    if (!lessonId) {
      return Response.json({ error: 'Missing lesson_id query parameter' }, { status: 400 })
    }

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
    const { data: reflection, error } = await serviceSupabase
      .from('reflections')
      .select('*')
      .eq('user_id', user.id)
      .eq('lesson_id', lessonId)
      .maybeSingle()

    if (error) {
      console.error(`[api/reflections] Error loading reflection:`, error)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    return Response.json(reflection || null)
  } catch (err) {
    console.error('[api/reflections GET]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
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

    // Support both v2 (lesson_id) and legacy (lesson_slug) clients during transition
    const normalizedBody = {
      ...body,
      lesson_id: body.lesson_id ?? body.lesson_slug,
    }
    delete normalizedBody.lesson_slug

    const parsed = reflectionPostSchema.safeParse(normalizedBody)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { lesson_id, content, is_public } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    const result = await recordReflectionAction(
      serviceSupabase,
      user.id,
      lesson_id,
      content,
      is_public
    )

    return Response.json(result)
  } catch (err) {
    console.error('[api/reflections POST]', err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json(
      { error: errorMsg },
      { status: 500 }
    )
  }
}
