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
    const updated = await AnnouncementsService.publishAnnouncement(
      id,
      auth.userId || null,
      auth.email || 'admin@prodily.app'
    )
    return NextResponse.json({ success: true, announcement: updated, message: 'Announcement published successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to publish announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
