import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserStreakStatus, getWeeklySummary } from '@/lib/streaks-db'

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

    const [statusSummary, weeklySummary] = await Promise.all([
      getUserStreakStatus(supabase, userId),
      getWeeklySummary(supabase, userId),
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
