import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { resetFlashcards } from '@/lib/settings/settings-service'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.reset.flashcards',
    domain: 'api',
    summary: 'Unexpected failure while resetting learner flashcards',
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
    await resetFlashcards(supabase, requireUserId(actor))

    return NextResponse.json({ success: true })
  }
)
