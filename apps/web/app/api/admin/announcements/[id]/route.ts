import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const item = await AnnouncementsService.getAnnouncementById(id)
    if (!item) {
      return NextResponse.json({ success: false, error: 'Announcement not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, announcement: item })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const updated = await AnnouncementsService.updateAnnouncement(
      id,
      body,
      auth.userId || null,
      auth.email || 'admin@prodily.app'
    )
    return NextResponse.json({ success: true, announcement: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    await AnnouncementsService.deleteAnnouncement(
      id,
      auth.userId || null,
      auth.email || 'admin@prodily.app'
    )
    return NextResponse.json({ success: true, message: 'Announcement deleted successfully' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
