import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** POST /api/admin/emails/broadcasts/[id]/execute — execute next batch */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const result = await BroadcastService.executeBroadcastBatch(id)

    await logAdminAction(
      authResult.userId,
      authResult.email || '',
      'EXECUTE_BROADCAST_BATCH',
      'email_broadcasts',
      id,
      { batchIndex: result.batchIndex, sent: result.sent, failed: result.failed, isComplete: result.isComplete }
    )

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
