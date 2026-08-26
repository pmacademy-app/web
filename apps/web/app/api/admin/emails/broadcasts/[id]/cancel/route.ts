import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** POST /api/admin/emails/broadcasts/[id]/cancel — cancel a scheduled or draft broadcast */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const result = await BroadcastService.cancelBroadcast(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await logAdminAction(authResult.userId, authResult.email || '', 'CANCEL_BROADCAST', 'email_broadcasts', id, {})
    return NextResponse.json({ success: true, message: 'Broadcast cancelled.' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
