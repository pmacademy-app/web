import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AnnouncementsService } from '@/lib/admin/announcements-service'
import { createServiceRoleClient } from '@/lib/supabase'
import { clampPagination, paginated } from '@/lib/api/pagination'

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
  async ({ request, actor }) => {
    const { searchParams } = new URL(request.url)
    const page = clampPagination({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    })

    // Only authenticated learners are eligible for learner announcements
    if (actor.kind !== 'learner') {
      const empty = paginated<never>([], page, 0)
      return NextResponse.json({ success: true, ...empty, announcements: empty.items })
    }

    const serviceSupabase = createServiceRoleClient()
    const { data: profile } = await serviceSupabase
      .from('users')
      .select('cohort_id')
      .eq('id', actor.userId)
      .maybeSingle()

    const cohortId = (profile as { cohort_id?: string | null })?.cohort_id || undefined

    const announcements = await AnnouncementsService.getActiveAnnouncementsForUser(actor.userId, cohortId)

    // Paged after audience filtering, not before — see the note in the service. The
    // filtered set is small by construction, so slicing it is the correct place to
    // apply the window and `total` is exact.
    const windowed = announcements.slice(page.offset, page.offset + page.limit)
    // `announcements` stays as an alias of `items` so SystemAnnouncementBanner keeps
    // reading the key it already reads.
    const body = paginated(windowed, page, announcements.length)
    return NextResponse.json({ success: true, ...body, announcements: body.items })
  }
)
