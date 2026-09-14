import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'


/** POST /api/admin/emails/broadcasts/[id]/schedule — schedule a broadcast */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.schedule.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/[id]/schedule',
  },
  async ({ request, actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const body = await request.json()
      const { scheduledAt } = body

      if (!scheduledAt || typeof scheduledAt !== 'string') {
        return NextResponse.json({ error: 'scheduledAt (ISO timestamp) is required.' }, { status: 400 })
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        return NextResponse.json({ error: 'scheduledAt must be in the future.' }, { status: 400 })
      }

      const result = await BroadcastService.scheduleBroadcast(id, scheduledAt)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      await logAdminAction(admin.userId, admin.email || '', 'SCHEDULE_BROADCAST', 'email_broadcasts', id, { scheduledAt })
      return NextResponse.json({ success: true, message: `Broadcast scheduled for ${scheduledAt}.` })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
