import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getSkillRadarSummary } from '@/lib/skillRadar'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'skill_radar.read',
    summary: 'Unexpected failure fetching the Skill Radar summary',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const summary = await getSkillRadarSummary(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, skillRadar: summary })
  }
)
