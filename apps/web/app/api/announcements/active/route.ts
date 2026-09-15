import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * Open to `anonymous`, which answers with an empty list — the pre-migration
 * behaviour for a caller with no session.
 *
 * **`?userId=` and `?cohortId=` are no longer read.** Before this batch the route
 * took both straight off the query string and only fell back to the session when
 * `userId` was absent, so `GET /api/announcements/active?userId=<someone-else>`
 * returned that learner's targeted announcements to any caller, signed in or not.
 * Identity now comes from the resolved actor and the cohort from that learner's own
 * profile row; the parameters are ignored. `SystemAnnouncementBanner` still sends
 * them and is unaffected, since it only ever sent the viewer's own ids.
 */
export const GET = withRoute(
  {
    actor: { allow: ['learner', 'anonymous'] },
    operation: 'announcements.active.read',
    summary: 'Unexpected failure fetching active announcements',
    errorMessage: 'Failed to fetch active announcements',
  },
  async ({ actor }) => {
    // Only authenticated learners are eligible for learner announcements
    if (actor.kind !== 'learner') {
      return NextResponse.json({ success: true, announcements: [] })
    }

    const serviceSupabase = createServiceRoleClient()
    const { data: profile } = await serviceSupabase
      .from('users')
      .select('cohort_id')
      .eq('id', actor.userId)
      .maybeSingle()

    const cohortId = (profile as { cohort_id?: string | null })?.cohort_id || undefined

    const announcements = await AnnouncementsService.getActiveAnnouncementsForUser(actor.userId, cohortId)
    return NextResponse.json({ success: true, announcements })
  }
)
