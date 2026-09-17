import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { clampPagination, paginated, toRange } from '@/lib/api/pagination'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.fellow_requests.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/fellow-requests',
  },
  async ({ request }) => {
    try {
      const { searchParams } = new URL(request.url)
      const status = searchParams.get('status') || undefined
      // B13-B: previously unbounded at the route — the service's internal `.limit(500)`
      // was a ceiling, not a page, so nothing above it was reachable.
      const page = clampPagination({
        limit: searchParams.get('limit'),
        offset: searchParams.get('offset'),
      })
      const queue = await FellowRequestAdminService.getQueue(status, toRange(page))

      // `requests` is kept as an alias of `items` so FellowRequestsView keeps reading
      // the key it already reads while the contract envelope becomes available.
      const body = paginated(queue.items, page, queue.total)
      return NextResponse.json({ success: true, ...body, requests: body.items })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to fetch Fellow request queue.')
      console.error('[API GET /api/admin/fellow-requests] Error:', error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
