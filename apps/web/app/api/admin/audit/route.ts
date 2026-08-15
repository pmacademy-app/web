import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { SystemService } from '@/lib/admin/system-service'

export const runtime = 'nodejs'

/**
 * Audit log from `admin_audit_logs` (spec §47 / §7.6).
 * Filters: admin, action, target, from, to, page, pageSize.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAdminUser(request)
  if (!authResult.authorized) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.statusCode || 403 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const result = await SystemService.getAuditLog({
      admin: searchParams.get('admin') || undefined,
      action: searchParams.get('action') || undefined,
      target: searchParams.get('target') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || 25,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch audit log'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}