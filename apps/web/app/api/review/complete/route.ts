import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { recordReviewSessionCompletion } from '@/lib/flashcards-service'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const rawCards = typeof body.cardsReviewedCount === 'number' && Number.isFinite(body.cardsReviewedCount) ? Math.floor(body.cardsReviewedCount) : 0
    const rawXp = typeof body.xpEarned === 'number' && Number.isFinite(body.xpEarned) ? Math.floor(body.xpEarned) : 0

    const cardsReviewedCount = Math.min(Math.max(0, rawCards), 500)
    const xpEarned = Math.min(Math.max(0, rawXp), 5000)

    const supabase = createServiceRoleClient()
    const result = await recordReviewSessionCompletion(supabase, user.id, cardsReviewedCount, xpEarned)

    return NextResponse.json({
      success: result.success,
    })
  } catch (error) {
    console.error('[API /api/review/complete] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error completing review session.' },
      { status: 500 }
    )
  }
}
