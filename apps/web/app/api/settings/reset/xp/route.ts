import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { resetXp } from '@/lib/settings/settings-service'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.xp',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner XP',
  },
  async ({ actor }) => {
    const supabase = createServiceRoleClient()
    const newTotalXp = await resetXp(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, total_xp: newTotalXp })
  }
)
