import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { InAppManagerService } from '@/lib/admin/in-app-manager-service'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.id.execute.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/in-app/[id]/execute',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    try {
      const res = await InAppManagerService.executeBroadcast(id)
      if (!res.success) {
        return NextResponse.json({ error: res.error || 'Execution failed' }, { status: 400 })
      }

      await logAdminAction(
        admin.userId,
        admin.email || '',
        'in_app_notification_executed',
        'in_app_broadcast',
        id,
        { targeted: res.targeted, delivered: res.delivered }
      )

      return NextResponse.json(res)
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Execution failed') },
        { status: 500 }
      )
    }
  }
)
