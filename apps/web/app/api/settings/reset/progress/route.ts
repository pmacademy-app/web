import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { resetProgress } from '@/lib/settings/settings-service'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.progress',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner progress',
  },
  async ({ request, actor }) => {
    // No body schema: the single optional field is tolerated in any shape, as
    // before migration, so a malformed body still resets everything rather than
    // becoming a 400.
    const body = await request.json().catch(() => ({}))
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
