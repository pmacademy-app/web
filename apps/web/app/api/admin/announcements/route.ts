import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export async function GET(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || 'all'
    const search = url.searchParams.get('search') || ''
    const limit = parseInt(url.searchParams.get('limit') || '50', 10)
    const offset = parseInt(url.searchParams.get('offset') || '0', 10)

    const result = await AnnouncementsService.getAnnouncements({ status, search, limit, offset })
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch announcements'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const body = await request.json()
    if (!body.title?.trim() || !body.content?.trim()) {
      return NextResponse.json({ success: false, error: 'Title and content are required' }, { status: 400 })
    }

    const created = await AnnouncementsService.createAnnouncement(
      body,
      auth.userId || null,
      auth.email || 'admin@prodily.app'
    )

    return NextResponse.json({ success: true, announcement: created })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create announcement'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
