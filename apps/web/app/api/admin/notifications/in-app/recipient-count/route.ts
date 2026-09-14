import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { countMatchingUsers } from '@/lib/admin/user-filter-query'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.recipient_count.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/in-app/recipient-count',
  },
  async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}))
      const { audience = 'all', targetUserId, targetCohortId, recipientFilters = {} } = body

      if (audience === 'individual') {
        const count = targetUserId ? 1 : 0
        return NextResponse.json({ success: true, count, audience })
      }

      if (audience === 'cohort') {
        if (!targetCohortId) {
          return NextResponse.json({ success: true, count: 0, audience })
        }
        const { createServiceRoleClient } = await import('@/lib/supabase')
        const supabase = createServiceRoleClient()
        const { count } = await supabase
          .from('cohort_members')
          .select('*', { count: 'exact', head: true })
          .eq('cohort_id', targetCohortId)

        return NextResponse.json({ success: true, count: count ?? 0, audience })
      }

      // Filtered or All: use unified server-side filter counter
      const count = await countMatchingUsers(recipientFilters as AdminUserFilters)
      return NextResponse.json({ success: true, count, audience })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Failed to calculate recipient count') },
        { status: 500 }
      )
    }
  }
)
