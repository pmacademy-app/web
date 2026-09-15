import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getUserReferralStats } from '@/lib/referral/referral-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'referrals.stats.read',
    summary: 'Unexpected failure fetching referral stats',
  },
  async ({ request, actor }) => {
    const supabase = createServiceRoleClient()
    const origin = new URL(request.url).origin
    const stats = await getUserReferralStats(supabase, requireUserId(actor), origin)

    return NextResponse.json({ success: true, stats })
  }
)
