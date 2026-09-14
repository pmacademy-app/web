import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'


/** POST /api/admin/emails/broadcasts/[id]/cancel — cancel a scheduled or draft broadcast */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.cancel.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/[id]/cancel',
  },
  async ({ actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const result = await BroadcastService.cancelBroadcast(id)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      await logAdminAction(admin.userId, admin.email || '', 'CANCEL_BROADCAST', 'email_broadcasts', id, {})
      return NextResponse.json({ success: true, message: 'Broadcast cancelled.' })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
