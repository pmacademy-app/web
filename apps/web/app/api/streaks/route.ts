import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getUserStreakStatus, getWeeklySummary } from '@/lib/streaks-db'

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
    const [statusSummary, weeklySummary] = await Promise.all([
      getUserStreakStatus(supabase, user.id),
      getWeeklySummary(supabase, user.id),
    ])

    return NextResponse.json({
      success: true,
      status: statusSummary,
      weeklySummary,
    })
  } catch (error) {
    console.error('[API /api/streaks] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching streak details.' },
      { status: 500 }
    )
  }
}
