import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.announcements.id.pause.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/announcements/[id]/pause',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const body = await request.json().catch(() => ({}))
      const paused = Boolean(body.paused ?? true)

      const updated = await AnnouncementsService.togglePauseAnnouncement(
        id,
        paused,
        admin.userId || null,
        admin.email || 'admin@prodily.app'
      )

      return NextResponse.json({
        success: true,
        announcement: updated,
        message: `Announcement ${paused ? 'paused' : 'resumed'} successfully`,
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update pause state')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
