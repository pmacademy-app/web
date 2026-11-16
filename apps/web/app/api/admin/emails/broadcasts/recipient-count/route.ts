import { NextResponse } from 'next/server'
import { RouteError, withRoute } from '@/lib/api/with-route'
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
    let body: { filters?: AdminUserFilters }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as { filters?: AdminUserFilters }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const filters = (body.filters ?? {}) as AdminUserFilters
    const count = await BroadcastService.previewRecipientCount(filters)
    return NextResponse.json({ success: true, count })
  }
)
