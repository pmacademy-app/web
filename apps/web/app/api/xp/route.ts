import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getUserXpSummary } from '@/lib/xp-service'

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

    const summary = await getUserXpSummary(supabase, userId)

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
