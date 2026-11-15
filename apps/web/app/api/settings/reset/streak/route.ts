import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { resetStreak } from '@/lib/settings/settings-service'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.streak',
    domain: 'api',
    summary: 'Unexpected failure while resetting a learner streak',
  },
  async ({ request, actor }) => {
    const body = await request.json().catch(() => ({}))
    const reauth = await verifyDestructiveReauth({
      actor,
      body,
      expectedPhrase: 'RESET',
    })

    if (!reauth.ok) {
      return reauth.response
    }

    const supabase = createServiceRoleClient()
    await resetStreak(supabase, requireUserId(actor))

    return NextResponse.json({ success: true })
  }
)
