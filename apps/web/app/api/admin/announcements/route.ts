import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/announcements',
  },
  async ({ request }) => {
    try {
      const url = new URL(request.url)
      const status = url.searchParams.get('status') || 'all'
      const search = url.searchParams.get('search') || ''
      const limit = parseInt(url.searchParams.get('limit') || '50', 10)
      const offset = parseInt(url.searchParams.get('offset') || '0', 10)

      const result = await AnnouncementsService.getAnnouncements({ status, search, limit, offset })
      return NextResponse.json({ success: true, ...result })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch announcements')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/announcements',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
    try {
      const body = await request.json()
      if (!body.title?.trim() || !body.content?.trim()) {
        return NextResponse.json({ success: false, error: 'Title and content are required' }, { status: 400 })
      }

      const created = await AnnouncementsService.createAnnouncement(
        body,
        admin.userId || null,
        admin.email || 'admin@prodily.app'
      )

      return NextResponse.json({ success: true, announcement: created })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to create announcement')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
