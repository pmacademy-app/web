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
    const cardsReviewedCount = typeof body.cardsReviewedCount === 'number' ? body.cardsReviewedCount : 0
    const xpEarned = typeof body.xpEarned === 'number' ? body.xpEarned : 0

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
