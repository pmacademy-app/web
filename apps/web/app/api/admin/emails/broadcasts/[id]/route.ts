import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

/** GET /api/admin/emails/broadcasts/[id]: get broadcast detail */
export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/broadcasts/[id]',
  },
  async ({ params }) => {
    const { id } = params
    const broadcast = await BroadcastService.getBroadcast(id)
    if (!broadcast) {
      throw new RouteError(404, 'NOT_FOUND', 'Broadcast not found.')
    }

    return NextResponse.json({ success: true, data: broadcast })
  }
)

/** PATCH /api/admin/emails/broadcasts/[id]: update a draft broadcast */
export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/emails/broadcasts/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params

    let body: Record<string, unknown>
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as Record<string, unknown>
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const result = await BroadcastService.updateBroadcast(id, body)
    if (!result.success) {
      throw new RouteError(400, 'BAD_REQUEST', result.error || 'Failed to update broadcast')
    }

    await logAdminAction(admin.userId, admin.email || '', 'UPDATE_BROADCAST', 'email_broadcasts', id, body)
    return NextResponse.json({ success: true, message: 'Broadcast updated.' })
  }
)

/** DELETE /api/admin/emails/broadcasts/[id]: delete a draft broadcast */
export const DELETE = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.delete',
    domain: 'admin',
    summary: 'Unexpected failure in DELETE /api/admin/emails/broadcasts/[id]',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    const result = await BroadcastService.deleteBroadcast(id)
    if (!result.success) {
      throw new RouteError(400, 'BAD_REQUEST', result.error || 'Failed to delete broadcast')
    }

    await logAdminAction(admin.userId, admin.email || '', 'DELETE_BROADCAST', 'email_broadcasts', id, {})
    return NextResponse.json({ success: true, message: 'Broadcast deleted.' })
  }
)
