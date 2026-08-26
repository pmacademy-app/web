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
  const res = await InAppManagerService.pauseBroadcast(id)
  if (!res.success) {
    return NextResponse.json({ error: res.error || 'Pause failed' }, { status: 400 })
  }

  await logAdminAction(
    auth.userId,
    auth.email || '',
    'in_app_notification_paused',
    'in_app_broadcast',
    id
  )

  return NextResponse.json({ success: true })
}
