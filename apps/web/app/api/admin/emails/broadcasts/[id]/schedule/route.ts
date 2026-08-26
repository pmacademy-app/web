import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** POST /api/admin/emails/broadcasts/[id]/schedule — schedule a broadcast */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
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

    await logAdminAction(authResult.userId, authResult.email || '', 'SCHEDULE_BROADCAST', 'email_broadcasts', id, { scheduledAt })
    return NextResponse.json({ success: true, message: `Broadcast scheduled for ${scheduledAt}.` })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
