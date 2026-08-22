import { NextResponse } from 'next/server'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const userId = body.userId

    if (!userId) {
      return NextResponse.json({ success: true, message: 'Client-only dismissal noted' })
    }

    await AnnouncementsService.dismissAnnouncement(id, userId)
    return NextResponse.json({ success: true, message: 'Announcement dismissed' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to dismiss announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
