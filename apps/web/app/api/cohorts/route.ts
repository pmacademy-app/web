import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getCohortsData, toggleCohortMembership } from '@/lib/leaderboard-db'

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
    const cohorts = await getCohortsData(supabase, user.id)

    return NextResponse.json({
      success: true,
      cohorts,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cohorts.'
    console.error('[API GET /api/cohorts] Error:', error)
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

    const body = await request.json()
    const { cohortSlug, action } = body ?? {}

    if (!cohortSlug || !['join', 'leave'].includes(action)) {
      return NextResponse.json({ error: 'Valid cohortSlug and action (join/leave) required.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    const result = await toggleCohortMembership(supabase, user.id, cohortSlug, action as 'join' | 'leave')

    return NextResponse.json({
      success: true,
      isMember: result.isMember,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update cohort membership.'
    console.error('[API POST /api/cohorts] Error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
