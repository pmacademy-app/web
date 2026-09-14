import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { sampleMatchingUsers } from '@/lib/admin/user-filter-query'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.in_app.recipient_sample.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/in-app/recipient-sample',
  },
  async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}))
      const { audience = 'all', targetUserId, targetCohortId, recipientFilters = {}, limit = 5 } = body
      const sampleLimit = Math.min(20, Math.max(1, limit))

      if (audience === 'individual') {
        if (!targetUserId) {
          return NextResponse.json({ success: true, users: [] })
        }
        const { createServiceRoleClient } = await import('@/lib/supabase')
        const supabase = createServiceRoleClient()
        const { data: user } = await supabase
          .from('users')
          .select('id, email, name, avatar_url, created_at')
          .eq('id', targetUserId)
          .maybeSingle()

        return NextResponse.json({ success: true, users: user ? [user] : [] })
      }

      if (audience === 'cohort') {
        if (!targetCohortId) {
          return NextResponse.json({ success: true, users: [] })
        }
        const { createServiceRoleClient } = await import('@/lib/supabase')
        const supabase = createServiceRoleClient()
        const { data: members } = await supabase
          .from('cohort_members')
          .select('user_id, users(id, email, name, avatar_url, created_at)')
          .eq('cohort_id', targetCohortId)
          .limit(sampleLimit)

        const users = ((members || []) as unknown as Array<{ users: Record<string, unknown> }>)
          .map((m) => m.users)
          .filter(Boolean)

        return NextResponse.json({ success: true, users })
      }

      // Filtered or All: use unified server-side sample query
      const users = await sampleMatchingUsers(recipientFilters as AdminUserFilters, sampleLimit)
      return NextResponse.json({ success: true, users })
    } catch (err) {
      return NextResponse.json(
        { error: adminErrorMessage(err, 'Failed to fetch recipient sample') },
        { status: 500 }
      )
    }
  }
)
