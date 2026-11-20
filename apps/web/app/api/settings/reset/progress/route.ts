import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { parseBody } from '@/lib/api/contracts/body'
import { resetProgressBodySchema } from '@/lib/api/contracts/settings'
import { resetProgress } from '@/lib/settings/settings-service'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.progress',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner progress',
  },
  async ({ request, actor }) => {
    // Read by hand: an empty body must still reach the re-auth helper, which owns the
    // dialog copy and charges the destructive limiter. A body that parses is type-checked.
    const parsed = parseBody(resetProgressBodySchema, await request.json().catch(() => ({})))
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

    const moduleSlug = body.module_slug

    const supabase = createServiceRoleClient()
    await resetProgress(supabase, requireUserId(actor), moduleSlug)

    // Clear next.js data cache for academy pages so they accurately reflect locked state
    revalidatePath('/academy', 'layout')
    revalidatePath('/dashboard', 'layout')
    revalidatePath('/progress', 'layout')
    revalidatePath('/capstones', 'layout')

    return NextResponse.json({ success: true })
  }
)
