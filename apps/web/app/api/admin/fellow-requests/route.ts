import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'
import { adminErrorMessage } from '@/lib/errors/api-response'

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
      const queue = await FellowRequestAdminService.getQueue(status)

      return NextResponse.json({ success: true, requests: queue })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to fetch Fellow request queue.')
      console.error('[API GET /api/admin/fellow-requests] Error:', error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
