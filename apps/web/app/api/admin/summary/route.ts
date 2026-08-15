import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { DashboardService } from '@/lib/admin/dashboard-service'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const summary = await DashboardService.getDashboardSummary()
    return NextResponse.json({ success: true, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard summary'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
