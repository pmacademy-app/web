import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getUserBadgesData, evaluateAndAwardBadges } from '@/lib/badges/badges-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'badges.read',
    summary: 'Unexpected failure fetching learner badges',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const badgeData = await getUserBadgesData(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, ...badgeData })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'badges.evaluate',
    summary: 'Unexpected failure evaluating learner badges',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const newlyAwarded = await evaluateAndAwardBadges(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, newlyAwarded })
  }
)
