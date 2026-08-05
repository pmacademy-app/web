import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getModuleCapstonesOverview } from '@/lib/capstones-db'

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null

    const supabase = createServerSupabaseClient()
    let userId: string | null = null

    if (token) {
      const { data: { user }, error: tokenErr } = await supabase.auth.getUser(token)
      if (!tokenErr && user) {
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

    const overview = await getModuleCapstonesOverview(supabase, userId)

    return NextResponse.json({
      success: true,
      capstones: overview,
    })
  } catch (error) {
    console.error('[API GET /api/capstones] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching capstones overview.' },
      { status: 500 }
    )
  }
}
