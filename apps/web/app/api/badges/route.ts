import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getUserBadgesData, evaluateAndAwardBadges } from '@/lib/badges-db'

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
    const badgeData = await getUserBadgesData(supabase, user.id)

    return NextResponse.json({
      success: true,
      ...badgeData,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user badges.'
    console.error('[API GET /api/badges] Error:', error)
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

    const supabase = createServiceRoleClient()
    const newlyAwarded = await evaluateAndAwardBadges(supabase, user.id)

    return NextResponse.json({
      success: true,
      newlyAwarded,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to evaluate badges.'
    console.error('[API POST /api/badges] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
