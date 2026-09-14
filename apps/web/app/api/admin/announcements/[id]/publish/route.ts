import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.id.publish.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/announcements/[id]/publish',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const updated = await AnnouncementsService.publishAnnouncement(
        id,
        admin.userId || null,
        admin.email || 'admin@prodily.app'
      )
      return NextResponse.json({ success: true, announcement: updated, message: 'Announcement published successfully' })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to publish announcement')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
