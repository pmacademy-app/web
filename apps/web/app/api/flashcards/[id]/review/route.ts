import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { recordFlashcardReview } from '@/lib/flashcards-service'
import { createServiceRoleClient } from '@/lib/supabase'

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

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'flashcards.review.submit',
    summary: 'Unexpected failure recording a flashcard review',
  },
  async ({ request, actor, params }) => {
    const body = await request.json().catch(() => null)
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) {
      throw new RouteError(400, 'VALIDATION', 'rating must be an integer between 0 and 5.')
    }

    const { rating, lessonId } = parsed.data
    const serviceSupabase = createServiceRoleClient()

    const result = await recordFlashcardReview(
      serviceSupabase,
      requireUserId(actor),
      params.id,
      rating,
      lessonId
    )

    return Response.json(result)
  }
)
