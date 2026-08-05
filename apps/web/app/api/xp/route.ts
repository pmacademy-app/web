import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getUserXpSummary } from '@/lib/xp-service'

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    const supabase = createServerSupabaseClient()
    const summary = await getUserXpSummary(supabase, user.id)

    return NextResponse.json({
      success: true,
      xp: summary,
    })
  } catch (error) {
    console.error('[API /api/xp] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error while fetching XP summary.' },
      { status: 500 }
    )
  }
}
