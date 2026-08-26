import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { countMatchingUsers } from '@/lib/admin/user-filter-query'
import type { AdminUserFilters } from '@/lib/admin/types'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: auth.statusCode || 401 })
  }

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
      { error: err instanceof Error ? err.message : 'Failed to calculate recipient count' },
      { status: 500 }
    )
  }
}
