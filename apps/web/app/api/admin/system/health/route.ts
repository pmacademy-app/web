import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const health = await AdminConsoleService.getSystemHealth()
    return NextResponse.json({ success: true, health })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch system health'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
