import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getReviewQueueData } from '@/lib/flashcards-service'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServerSupabaseClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (!userError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        userId = user.id
      }
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const queueData = await getReviewQueueData(supabase, userId)

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
