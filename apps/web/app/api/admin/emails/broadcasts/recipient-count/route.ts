import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

/**
 * POST /api/admin/emails/broadcasts/recipient-count
 * Returns the count of users matching the provided filters.
 * Uses the same filtering logic as broadcast execution.
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.recipient_count.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/recipient-count',
  },
  async ({ request }) => {
    try {
      const body = await request.json()
      const filters = (body.filters ?? {}) as AdminUserFilters

      const count = await BroadcastService.previewRecipientCount(filters)
      return NextResponse.json({ success: true, count })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
