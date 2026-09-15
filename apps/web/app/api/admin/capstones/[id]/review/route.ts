import { NextResponse } from 'next/server'

import { ModerationService } from '@/lib/admin/moderation-service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.capstones.id.review.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/capstones/[id]/review',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params

      let body: { action?: string }
      try {
        body = await request.json()
      } catch {
        return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
      }

      const { action } = body

      if (!action || !['approve', 'reject'].includes(action)) {
        return NextResponse.json(
          { error: 'Valid action (approve, reject) is required.' },
          { status: 400 }
        )
      }

      const success = await ModerationService.reviewCapstone(
        admin.userId,
        admin.email,
        id,
        action as 'approve' | 'reject'
      )

      if (!success) {
        return NextResponse.json({ error: 'Failed to review capstone submission.' }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Error reviewing capstone submission.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
