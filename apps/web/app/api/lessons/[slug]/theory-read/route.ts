import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordTheoryReadAction } from '@/lib/lessons-db'

const theoryReadSchema = z.object({
  active_seconds: z.number().min(0),
  scroll_percentage: z.number().min(0).max(100),
})

export async function POST(
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
    const parsed = theoryReadSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { active_seconds, scroll_percentage } = parsed.data
    const serviceSupabase = createServerSupabaseClient()

    const result = await recordTheoryReadAction(
      serviceSupabase,
      user.id,
      slug,
      active_seconds,
      scroll_percentage
    )

    return Response.json(result)
  } catch (err) {
    console.error('[api/lessons/[slug]/theory-read POST]', err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json(
      { error: errorMsg },
      { status: 500 }
    )
  }
}
