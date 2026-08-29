import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createAuthenticatedServerClient, createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUser } from '@/lib/auth'
import { recordFlashcardReview } from '@/lib/flashcards-service'

const reviewSchema = z.object({
  rating: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  lessonId: z.string().optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
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
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const { rating, lessonId } = parsed.data
    const serviceSupabase = createServiceRoleClient()

    const result = await recordFlashcardReview(
      serviceSupabase,
      user.id,
      id,
      rating,
      lessonId
    )

    return Response.json(result)
  } catch (err) {
    console.error('[api/flashcards/[id]/review POST]', err)
    const errorMsg = err instanceof Error ? err.message : 'Internal server error'
    return Response.json(
      { error: errorMsg },
      { status: 500 }
    )
  }
}
