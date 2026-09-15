import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { DashboardService } from '@/lib/admin/dashboard-service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.summary.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/summary',
  },
  async () => {
    try {
      const summary = await DashboardService.getDashboardSummary()
      return NextResponse.json({ success: true, summary })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to load dashboard summary')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
