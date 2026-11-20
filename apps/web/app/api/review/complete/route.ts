import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { parseBody } from '@/lib/api/contracts/body'
import { reviewCompleteBodySchema } from '@/lib/api/contracts/learner-writes'
import { recordReviewSessionCompletion } from '@/lib/flashcards-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'review.session.complete',
    summary: 'Unexpected failure completing a review session',
    // One call per finished review session. 120 per 10 minutes is far past any real
    // pace and still bounds a scripted loop farming the per-session XP.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `review_complete_${actor.userId}` : null),
        limit: 120,
        windowMs: 10 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor }) => {
    // Read here rather than via a declared schema: an absent or unparseable body
    // still falls back to a zero-count session, as it always has. A body that does
    // parse must be the two numbers ReviewHub sends, and the clamp below remains the
    // abuse control: a client cannot claim more than 500 cards or 5000 XP.
    const parsed = parseBody(reviewCompleteBodySchema, await request.json().catch(() => ({})))
    if (!parsed.ok) throw new RouteError(400, 'VALIDATION', parsed.message)
    const body = parsed.data
    const rawCards =
      typeof body.cardsReviewedCount === 'number' && Number.isFinite(body.cardsReviewedCount)
        ? Math.floor(body.cardsReviewedCount)
        : 0
    const rawXp =
      typeof body.xpEarned === 'number' && Number.isFinite(body.xpEarned)
        ? Math.floor(body.xpEarned)
        : 0

    const cardsReviewedCount = Math.min(Math.max(0, rawCards), 500)
    const xpEarned = Math.min(Math.max(0, rawXp), 5000)

    const supabase = createServiceRoleClient()
    const result = await recordReviewSessionCompletion(
      supabase,
      requireUserId(actor),
      cardsReviewedCount,
      xpEarned
    )

    return NextResponse.json({ success: result.success })
  }
)
