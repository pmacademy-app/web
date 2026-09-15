import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { SystemService } from '@/lib/admin/system-service'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const runtime = 'nodejs'

/**
 * Audit log from `admin_audit_logs` (spec §47 / §7.6).
 * Filters: admin, action, target, from, to, page, pageSize.
 */
export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.audit.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/audit',
  },
  async ({ request }) => {
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
    const message = adminErrorMessage(err, 'Failed to fetch audit log')
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
  }
)
