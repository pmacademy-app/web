import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AdminConsoleService } from '@/lib/admin/service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.system.health.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/system/health',
  },
  async () => {
    try {
      const health = await AdminConsoleService.getSystemHealth()
      return NextResponse.json({ success: true, health })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch system health')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
