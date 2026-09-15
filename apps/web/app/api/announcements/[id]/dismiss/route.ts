import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'

/**
 * Open to `anonymous`, which acknowledges the dismissal without writing — the
 * pre-migration behaviour when no session could be resolved (the banner also keeps
 * a `localStorage` copy, so a signed-out dismissal still sticks in that browser).
 *
 * **`body.userId` is no longer read.** Before this batch the route took the target
 * learner straight from the request body and only fell back to the session when the
 * field was absent, so any caller could dismiss any learner's announcements by
 * posting someone else's id. The row written is now always the resolved actor's.
 */
export const POST = withRoute(
  {
    actor: { allow: ['learner', 'anonymous'] },
    operation: 'announcements.dismiss',
    summary: 'Unexpected failure dismissing an announcement',
    errorMessage: 'Failed to dismiss announcement',
  },
  async ({ actor, params }) => {
    if (actor.kind !== 'learner') {
      return NextResponse.json({ success: true, message: 'Client-only dismissal noted' })
    }

    await AnnouncementsService.dismissAnnouncement(params.id, actor.userId)
    return NextResponse.json({ success: true, message: 'Announcement dismissed' })
  }
)
