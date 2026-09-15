import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { recordReviewSessionCompletion } from '@/lib/flashcards-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'review.session.complete',
    summary: 'Unexpected failure completing a review session',
  },
  async ({ request, actor }) => {
    // Read here rather than via a declared schema: this route clamped whatever it
    // was given and never refused a malformed body, and the clamp is the abuse
    // control — a client cannot claim more than 500 cards or 5000 XP.
    const body = (await request.json().catch(() => ({}))) as {
      cardsReviewedCount?: unknown
      xpEarned?: unknown
    }
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
