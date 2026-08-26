import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
  }

  const { id } = await props.params
  const res = await InAppManagerService.cancelBroadcast(id)
  if (!res.success) {
    return NextResponse.json({ error: res.error || 'Cancel failed' }, { status: 400 })
  }

  await logAdminAction({
    adminUserId: auth.userId,
    adminEmail: auth.email || '',
    action: 'in_app_notification_cancelled',
    targetId: id,
  })

  return NextResponse.json({ success: true })
}
