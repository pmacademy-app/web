import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.fellow_requests.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/fellow-requests/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const body = await request.json().catch(() => ({}))
      const { decision, rejectionReason } = body ?? {}

      if (decision !== 'approved' && decision !== 'rejected') {
        return NextResponse.json({ error: 'decision must be "approved" or "rejected".' }, { status: 400 })
      }

      const result = await FellowRequestAdminService.reviewRequest(
        admin.userId,
        admin.email,
        id,
        decision,
        typeof rejectionReason === 'string' ? rejectionReason : undefined
      )

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to review Fellow request.' }, { status: 400 })
      }

      // The Fellow Requests queue lives inside the Moderation workspace (a tab,
      // not its own route) and approval also flips is_fellow on the user's
      // public portfolio/OG cache (handled inside toggleUserFellowStatus).
      revalidatePath('/admin/moderation')
      revalidatePath('/admin/users')

      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to review Fellow request.')
      console.error('[API PATCH /api/admin/fellow-requests/[id]] Error:', error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
