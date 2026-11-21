import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getUserStreakStatus, getWeeklySummary } from '@/lib/streaks/streaks-db'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'streaks.read',
    summary: 'Unexpected failure fetching streak details',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const supabase = await getLearnerDbForRequest(request)
    const [statusSummary, weeklySummary] = await Promise.all([
      getUserStreakStatus(supabase, userId),
      getWeeklySummary(supabase, userId),
    ])

    return NextResponse.json({ success: true, status: statusSummary, weeklySummary })
  }
)
