import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getModuleCapstonesOverview } from '@/lib/capstones-db'

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
    const overview = await getModuleCapstonesOverview(supabase, user.id)

    return NextResponse.json({
      success: true,
      overview,
    })
  } catch (error) {
    console.error('[API GET /api/capstones] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error fetching capstones overview.' },
      { status: 500 }
    )
  }
}
