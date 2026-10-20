import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService, BroadcastRefusedError } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'


/** POST /api/admin/emails/broadcasts/[id]/execute — execute next batch */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.execute.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/[id]/execute',
  },
  async ({ actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const result = await BroadcastService.executeBroadcastBatch(id)

      await logAdminAction(
        admin.userId,
        admin.email || '',
        'EXECUTE_BROADCAST_BATCH',
        'email_broadcasts',
        id,
        { batchIndex: result.batchIndex, sent: result.sent, failed: result.failed, isComplete: result.isComplete }
      )

      return NextResponse.json({ success: true, data: result })
    } catch (err) {
      // CQ-02: a campaign the service refuses to send is a conflict, not a server fault.
      if (err instanceof BroadcastRefusedError) {
        return NextResponse.json({ error: err.message }, { status: 409 })
      }
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
