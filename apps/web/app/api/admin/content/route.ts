import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AdminConsoleService } from '@/lib/admin/service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.content.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/content',
  },
  async () => {
    try {
      const overview = await AdminConsoleService.getContentOverview()
      return NextResponse.json({ success: true, overview })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch content overview')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
