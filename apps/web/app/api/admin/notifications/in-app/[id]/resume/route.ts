import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.id.resume.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/in-app/[id]/resume',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    const res = await InAppManagerService.resumeBroadcast(id)
    if (!res.success) {
      return NextResponse.json({ error: res.error || 'Resume failed' }, { status: 400 })
    }

    await logAdminAction(
      admin.userId,
      admin.email || '',
      'in_app_notification_resumed',
      'in_app_broadcast',
      id
    )

    return NextResponse.json({ success: true })
  }
)
