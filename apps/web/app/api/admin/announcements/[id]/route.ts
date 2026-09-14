import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.id.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/announcements/[id]',
  },
  async ({ params }) => {
    try {
      const { id } = params
      const item = await AnnouncementsService.getAnnouncementById(id)
      if (!item) {
        return NextResponse.json({ success: false, error: 'Announcement not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, announcement: item })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch announcement')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/announcements/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const body = await request.json()
      const updated = await AnnouncementsService.updateAnnouncement(
        id,
        body,
        admin.userId || null,
        admin.email || 'admin@prodily.app'
      )
      return NextResponse.json({ success: true, announcement: updated })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update announcement')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)

export const DELETE = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.id.delete',
    domain: 'admin',
    summary: 'Unexpected failure in DELETE /api/admin/announcements/[id]',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      await AnnouncementsService.deleteAnnouncement(
        id,
        admin.userId || null,
        admin.email || 'admin@prodily.app'
      )
      return NextResponse.json({ success: true, message: 'Announcement deleted successfully' })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to delete announcement')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
