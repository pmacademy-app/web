import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { getUserReferralStats } from '@/lib/referral/referral-service'

export const runtime = 'nodejs'

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
    const origin = new URL(request.url).origin
    const stats = await getUserReferralStats(supabase, user.id, origin)

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch referral stats.'
    console.error('[API GET /api/referrals] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
