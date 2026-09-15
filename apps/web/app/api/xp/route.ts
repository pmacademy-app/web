import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { getUserXpSummary } from '@/lib/xp-service'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'xp.read',
    summary: 'Unexpected failure fetching the XP summary',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const summary = await getUserXpSummary(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, xp: summary })
  }
)
