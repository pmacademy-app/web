import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
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

    let query = supabase.from('system_errors')
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
    const { count: unackCritical } = await supabase.from('system_errors')
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
    if (!authResult.authorized || !authResult.userId || !authResult.email) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json()
    const { alertId, fingerprint, newStatus } = body

    if ((!alertId && !fingerprint) || !['new', 'acknowledged', 'resolved'].includes(newStatus)) {
      return NextResponse.json({ error: 'Valid alertId or fingerprint and newStatus are required.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    let query = supabase.from('system_errors')
      .update({ status: newStatus, updated_at: new Date().toISOString() })

    if (alertId) {
      query = query.eq('id', alertId)
    } else if (fingerprint) {
      query = query.eq('fingerprint', fingerprint)
    }

    const { error: updateErr } = await query

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }

    const targetId = alertId || fingerprint || 'group'
    await logAdminAction(authResult.userId, authResult.email, `system_alert_${newStatus}`, 'system_error', targetId, { newStatus, alertId, fingerprint })

    return NextResponse.json({ success: true, message: `Alert status updated to ${newStatus}` })
  } catch (err) {
    console.error('[AdminSystemAlerts] Exception updating alert status:', err)
    return NextResponse.json({ error: 'Internal server error while updating alert.' }, { status: 500 })
  }
}

