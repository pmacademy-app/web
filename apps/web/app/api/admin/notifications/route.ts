import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

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
    const message = err instanceof Error ? err.message : 'Failed to fetch notification events'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
