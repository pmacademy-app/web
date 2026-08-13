import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const severity = searchParams.get('severity')
    const category = searchParams.get('category')
    const status = searchParams.get('status') || 'new'
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)))

    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from('system_errors' as any) as any)
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (severity && severity !== 'all') {
      query = query.eq('severity', severity)
    }
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: errors, error: queryErr } = await query

    if (queryErr) {
      console.warn('[AdminSystemAlerts] DB query error (table may be pending migration):', queryErr.message)
      return NextResponse.json({ success: true, alerts: [], total: 0 })
    }

    // Also get unacknowledged critical alert count
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: unackCritical } = await (supabase.from('system_errors' as any) as any)
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('severity', 'critical')

    return NextResponse.json({
      success: true,
      alerts: errors || [],
      unacknowledgedCriticalCount: unackCritical || 0,
    })
  } catch (err) {
    console.error('[AdminSystemAlerts] Exception fetching system alerts:', err)
    return NextResponse.json({ error: 'Internal server error while fetching alerts.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json()
    const { alertId, newStatus } = body

    if (!alertId || !['new', 'acknowledged', 'resolved'].includes(newStatus)) {
      return NextResponse.json({ error: 'Valid alertId and newStatus are required.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase.from('system_errors' as any) as any)
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', alertId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: `Alert status updated to ${newStatus}` })
  } catch (err) {
    console.error('[AdminSystemAlerts] Exception updating alert status:', err)
    return NextResponse.json({ error: 'Internal server error while updating alert.' }, { status: 500 })
  }
}
