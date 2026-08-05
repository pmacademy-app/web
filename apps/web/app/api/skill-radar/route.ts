import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getSkillRadarSummary } from '@/lib/skillRadar'

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
    const summary = await getSkillRadarSummary(supabase, user.id)

    return NextResponse.json({
      success: true,
      skillRadar: summary,
    })
  } catch (error) {
    console.error('[API /api/skill-radar] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error while fetching Skill Radar summary.' },
      { status: 500 }
    )
  }
}
