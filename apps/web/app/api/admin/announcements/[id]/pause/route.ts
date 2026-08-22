import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const paused = Boolean(body.paused ?? true)

    const updated = await AnnouncementsService.togglePauseAnnouncement(
      id,
      paused,
      auth.userId || null,
      auth.email || 'admin@prodily.app'
    )

    return NextResponse.json({
      success: true,
      announcement: updated,
      message: `Announcement ${paused ? 'paused' : 'resumed'} successfully`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update pause state'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
