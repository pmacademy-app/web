import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { BroadcastService } from '@/lib/admin/broadcast-service'

export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string }>
}

/** GET /api/admin/emails/broadcasts/[id] — get broadcast detail */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const broadcast = await BroadcastService.getBroadcast(id)
    if (!broadcast) {
      return NextResponse.json({ error: 'Broadcast not found.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: broadcast })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/** PATCH /api/admin/emails/broadcasts/[id] — update a draft broadcast */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json()

    const result = await BroadcastService.updateBroadcast(id, body)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await logAdminAction(authResult.userId, authResult.email || '', 'UPDATE_BROADCAST', 'email_broadcasts', id, body)
    return NextResponse.json({ success: true, message: 'Broadcast updated.' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/** DELETE /api/admin/emails/broadcasts/[id] — delete a draft broadcast */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const result = await BroadcastService.deleteBroadcast(id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await logAdminAction(authResult.userId, authResult.email || '', 'DELETE_BROADCAST', 'email_broadcasts', id, {})
    return NextResponse.json({ success: true, message: 'Broadcast deleted.' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
