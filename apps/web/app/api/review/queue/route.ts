import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getReviewQueueData } from '@/lib/flashcards-service'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'review.queue.read',
    summary: 'Unexpected failure fetching the review queue',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const queueData = await getReviewQueueData(supabase, requireUserId(actor))

    return NextResponse.json({
      success: true,
      dueCards: queueData.dueCards,
      stats: queueData.stats,
      totalUnlocked: queueData.allUnlockedCards.length,
    })
  }
)
