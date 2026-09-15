import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getUserStreakStatus, getWeeklySummary } from '@/lib/streaks-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'streaks.read',
    summary: 'Unexpected failure fetching streak details',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()
    const [statusSummary, weeklySummary] = await Promise.all([
      getUserStreakStatus(supabase, userId),
      getWeeklySummary(supabase, userId),
    ])

    return NextResponse.json({ success: true, status: statusSummary, weeklySummary })
  }
)
