import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getSkillRadarSummary } from '@/lib/skillRadar'

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

    const summary = await getSkillRadarSummary(supabase, userId)

    return NextResponse.json({
      success: true,
      radar: summary.scores,
      overallScore: summary.overallScore,
      breakdown: summary.breakdown,
    })
  } catch (error) {
    console.error('[API /api/skill-radar] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching skill radar metrics.' },
      { status: 500 }
    )
  }
}
