import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getModuleCapstonesOverview } from '@/lib/capstones/capstones-db'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.overview.read',
    summary: 'Unexpected failure fetching the capstones overview',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const overview = await getModuleCapstonesOverview(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, overview })
  }
)
