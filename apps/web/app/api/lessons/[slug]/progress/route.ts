import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'

const patchSchema = z.object({
  status: z.literal('in_progress'),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
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
    const { data: progress, error } = await serviceSupabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('lesson_slug', slug)
      .maybeSingle()

    if (error) {
      console.error(`[api/lessons/${slug}/progress] Error fetching progress:`, error)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    if (!progress) {
      return Response.json({
        user_id: user.id,
        lesson_slug: slug,
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
    console.error('[api/lessons/[slug]/progress GET]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
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
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { status } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    // Query current status to prevent overriding a completed state with in_progress
    const { data: existing } = (await serviceSupabase
      .from('user_lesson_progress')
      .select('*')
      .eq('user_id', user.id)
      .eq('lesson_slug', slug)
      .maybeSingle()) as unknown as { data: { status: string } | null; error: unknown }

    if (existing?.status === 'completed' && status === 'in_progress') {
      return Response.json({ message: 'Already completed, update ignored.' })
    }

    interface SupabaseTable {
      upsert: (data: unknown, options?: unknown) => {
        select: () => {
          single: () => Promise<{ data: unknown; error: unknown }>
        }
      }
    }
    const { data: updated, error } = (await (serviceSupabase
      .from('user_lesson_progress') as unknown as SupabaseTable)
      .upsert({
        user_id: user.id,
        lesson_slug: slug,
        status,
      }, { onConflict: 'user_id,lesson_slug' })
      .select()
      .single()) as unknown as { data: { status: string } | null; error: unknown }

    if (error) {
      console.error(`[api/lessons/${slug}/progress] Error upserting progress:`, error)
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    return Response.json(updated)
  } catch (err) {
    console.error('[api/lessons/[slug]/progress PATCH]', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
