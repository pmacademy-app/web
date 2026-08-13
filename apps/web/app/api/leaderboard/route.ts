import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getWeeklyLeaderboard, toggleLeaderboardOptIn } from '@/lib/leaderboard-db'

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
    const payload = await getWeeklyLeaderboard(supabase, user.id)

    return NextResponse.json({
      success: true,
      ...payload,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch leaderboard.'
    console.error('[API GET /api/leaderboard] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

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
    const isOptedIn = Boolean(body.isOptedIn)

    const supabase = createServiceRoleClient()
    const result = await toggleLeaderboardOptIn(supabase, user.id, isOptedIn)

    return NextResponse.json({
      success: true,
      isOptedIn: result.isOptedIn,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update privacy settings.'
    console.error('[API POST /api/leaderboard] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
