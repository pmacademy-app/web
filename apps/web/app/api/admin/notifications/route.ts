import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/notifications',
  },
  async () => {
    try {
      const supabase = createServiceRoleClient()
      const { data: events, error } = await supabase
        .from('notification_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        return NextResponse.json({ success: true, count: 0, events: [] })
      }

      return NextResponse.json({ success: true, count: events?.length || 0, events })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch notification events')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
