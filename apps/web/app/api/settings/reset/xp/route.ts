import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { parseBody } from '@/lib/api/contracts/body'
import { destructiveReauthBodySchema } from '@/lib/api/contracts/settings'
import { resetXp } from '@/lib/settings/settings-service'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.xp',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner XP',
  },
  async ({ request, actor }) => {
    // Read by hand: an empty body must still reach the re-auth helper, which owns the
    // dialog copy and charges the destructive limiter. A body that parses is type-checked.
    const parsed = parseBody(destructiveReauthBodySchema, await request.json().catch(() => ({})))
    if (!parsed.ok) throw new RouteError(400, 'VALIDATION', parsed.message)
    const body = parsed.data
    const reauth = await verifyDestructiveReauth({
      actor,
      body,
      expectedPhrase: 'RESET',
    })

    if (!reauth.ok) {
      return reauth.response
    }

    const supabase = createServiceRoleClient()
    const newTotalXp = await resetXp(supabase, requireUserId(actor))

    return NextResponse.json({ success: true, total_xp: newTotalXp })
  }
)
