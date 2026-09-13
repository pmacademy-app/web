import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { resetSkillRadar } from '@/lib/settings/settings-service'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.skill_radar',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner skill radar',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    await resetSkillRadar(supabase, requireUserId(actor))

    return NextResponse.json({ success: true })
  }
)
