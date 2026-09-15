import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.feedback.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/feedback',
  },
  async ({ request }) => {
    try {
      const { searchParams } = new URL(request.url)
      const statusFilter = searchParams.get('status') || undefined

      const queue = await FeedbackAdminService.getModerationQueue(statusFilter)
      return NextResponse.json({ queue })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to fetch moderation queue.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
