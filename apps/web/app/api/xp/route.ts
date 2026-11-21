import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getUserXpSummary } from '@/lib/xp/xp-service'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'xp.read',
    summary: 'Unexpected failure fetching the XP summary',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const summary = await getUserXpSummary(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, xp: summary })
  }
)
