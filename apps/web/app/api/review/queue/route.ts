import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getReviewQueueData } from '@/lib/flashcards-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'review.queue.read',
    summary: 'Unexpected failure fetching the review queue',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const queueData = await getReviewQueueData(supabase, requireUserId(actor))

    return NextResponse.json({
      success: true,
      dueCards: queueData.dueCards,
      stats: queueData.stats,
      totalUnlocked: queueData.allUnlockedCards.length,
    })
  }
)
