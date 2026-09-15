import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getModuleCapstonesOverview } from '@/lib/capstones-db'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'capstones.overview.read',
    summary: 'Unexpected failure fetching the capstones overview',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const overview = await getModuleCapstonesOverview(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, overview })
  }
)
