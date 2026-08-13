import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getReviewQueueData } from '@/lib/flashcards-service'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServiceRoleClient()
    const queueData = await getReviewQueueData(supabase, user.id)

    return NextResponse.json({
      success: true,
      dueCards: queueData.dueCards,
      stats: queueData.stats,
      totalUnlocked: queueData.allUnlockedCards.length,
    })
  } catch (error) {
    console.error('[API /api/review/queue] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching review queue.' },
      { status: 500 }
    )
  }
}
