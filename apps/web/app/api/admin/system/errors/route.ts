import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { SystemService } from '@/lib/admin/system-service'

export const runtime = 'nodejs'

/**
 * Grouped operational errors from `system_errors` (spec §46 / §7.5).
 * Filters: severity, category, status, page, pageSize.
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
    const result = await SystemService.getErrorGroups({
      severity: searchParams.get('severity') || undefined,
      category: searchParams.get('category') || undefined,
      status: searchParams.get('status') || undefined,
      page: Number(searchParams.get('page')) || 1,
      pageSize: Number(searchParams.get('pageSize')) || 25,
    })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch system errors'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAdminUser(request)
  if (!authResult.authorized || !authResult.userId || !authResult.email) {
    return NextResponse.json(
      { error: authResult.error || 'Unauthorized' },
      { status: authResult.statusCode || 403 }
    )
  }

  try {
    const body = await request.json()
    const { fingerprint, newStatus } = body

    if (!fingerprint || !['new', 'acknowledged', 'resolved'].includes(newStatus)) {
      return NextResponse.json(
        { error: 'Valid fingerprint and newStatus are required.' },
        { status: 400 }
      )
    }

    const result = await SystemService.updateErrorGroupStatus(fingerprint, newStatus)
    await logAdminAction(
      authResult.userId,
      authResult.email,
      `system_error_${newStatus}`,
      'system_error',
      fingerprint,
      { newStatus, updatedCount: result.updatedCount }
    )

    return NextResponse.json({ ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update system error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}