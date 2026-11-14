import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

/** POST /api/admin/emails/broadcasts/[id]/schedule: schedule a broadcast */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.broadcasts.id.schedule.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/broadcasts/[id]/schedule',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params

    let body: { scheduledAt?: unknown }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as { scheduledAt?: unknown }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { scheduledAt } = body

    if (!scheduledAt || typeof scheduledAt !== 'string') {
      throw new RouteError(400, 'VALIDATION', 'scheduledAt (ISO timestamp) is required.')
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      throw new RouteError(400, 'VALIDATION', 'scheduledAt must be in the future.')
    }

    const result = await BroadcastService.scheduleBroadcast(id, scheduledAt)
    if (!result.success) {
      throw new RouteError(400, 'BAD_REQUEST', result.error || 'Failed to schedule broadcast')
    }

    await logAdminAction(admin.userId, admin.email || '', 'SCHEDULE_BROADCAST', 'email_broadcasts', id, { scheduledAt })
    return NextResponse.json({ success: true, message: `Broadcast scheduled for ${scheduledAt}.` })
  }
)
