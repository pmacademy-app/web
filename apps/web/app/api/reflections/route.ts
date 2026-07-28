import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordReflectionAction } from '@/lib/lessons-db'

const reflectionPostSchema = z.object({
  lesson_slug: z.string(),
  content: z.string().min(1, 'Reflection content cannot be empty'),
  is_public: z.boolean().default(false),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const lessonSlug = searchParams.get('lesson_slug')

    if (!lessonSlug) {
      return Response.json({ error: 'Missing lesson_slug query parameter' }, { status: 400 })
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
      .eq('lesson_slug', lessonSlug)
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
    const parsed = reflectionPostSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { lesson_slug, content, is_public } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    const result = await recordReflectionAction(
      serviceSupabase,
      user.id,
      lesson_slug,
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
