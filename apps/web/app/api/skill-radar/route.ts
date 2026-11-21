import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { getLearnerDbForRequest } from '@/lib/auth'
import { getSkillRadarSummary } from '@/lib/skillRadar'

export const GET = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'skill_radar.read',
    summary: 'Unexpected failure fetching the Skill Radar summary',
  },
  async ({ request, actor }) => {
    const supabase = await getLearnerDbForRequest(request)
    const summary = await getSkillRadarSummary(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, skillRadar: summary })
  }
)
