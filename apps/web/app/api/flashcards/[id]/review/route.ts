import { z } from 'zod'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { FLASHCARD_ID_PATTERN, LESSON_ID_PATTERN } from '@/lib/academy/lesson-ids'
import { recordFlashcardReview } from '@/lib/flashcards-service'
import { createServiceRoleClient } from '@/lib/supabase'

const reviewSchema = z.object({
  rating: z.union(
    [z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)],
    { message: 'rating must be an integer between 0 and 5.' }
  ),
  lessonId: z.string().max(64).regex(LESSON_ID_PATTERN, 'Invalid lessonId.').optional(),
})

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'flashcards.review.submit',
    summary: 'Unexpected failure recording a flashcard review',
    body: reviewSchema,
    // SEC-08: one call per card reviewed. 300 an hour per learner covers a long review
    // session while bounding writes and streak updates from a script.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `flashcard_review_${actor.userId}` : null),
        limit: 300,
        windowMs: 60 * 60 * 1000,
      },
    ],
  },
  async ({ actor, body, params }) => {
    // Shape check here; recordFlashcardReview also proves the card exists before any write.
    if (!FLASHCARD_ID_PATTERN.test(params.id ?? '')) {
      throw new RouteError(404, 'NOT_FOUND', 'Flashcard not found.')
    }

    const serviceSupabase = createServiceRoleClient()

    const result = await recordFlashcardReview(
      serviceSupabase,
      requireUserId(actor),
      params.id,
      body.rating,
      body.lessonId
    )

    return Response.json(result)
  }
)
