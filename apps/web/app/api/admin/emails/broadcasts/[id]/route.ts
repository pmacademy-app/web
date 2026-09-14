import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'


/** GET /api/admin/emails/broadcasts/[id] — get broadcast detail */
export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/broadcasts/[id]',
  },
  async ({ params }) => {
    try {
      const { id } = params
      const broadcast = await BroadcastService.getBroadcast(id)
      if (!broadcast) {
        return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 })
      }

      return NextResponse.json({ success: true, data: broadcast })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)

/** PATCH /api/admin/emails/broadcasts/[id] — update a draft broadcast */
export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/emails/broadcasts/[id]',
  },
  async ({ request, actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const body = await request.json()

      const result = await BroadcastService.updateBroadcast(id, body)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      await logAdminAction(admin.userId, admin.email || '', 'UPDATE_BROADCAST', 'email_broadcasts', id, body)
      return NextResponse.json({ success: true, message: 'Broadcast updated.' })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)

/** DELETE /api/admin/emails/broadcasts/[id] — delete a draft broadcast */
export const DELETE = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.delete',
    domain: 'admin',
    summary: 'Unexpected failure in DELETE /api/admin/emails/broadcasts/[id]',
  },
  async ({ actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const result = await BroadcastService.deleteBroadcast(id)
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      await logAdminAction(admin.userId, admin.email || '', 'DELETE_BROADCAST', 'email_broadcasts', id, {})
      return NextResponse.json({ success: true, message: 'Broadcast deleted.' })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Internal server error') },
        { status: 500 }
      )
    }
  }
)
