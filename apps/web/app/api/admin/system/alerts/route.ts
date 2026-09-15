import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { sanitizeErrorMessage } from '@/lib/monitoring/redaction'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.system.alerts.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/system/alerts',
  },
  async ({ request }) => {
  try {
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
      // A failed alerts query must NEVER be rendered as "no alerts". Returning an
      // empty success made a broken monitoring pipeline indistinguishable from a
      // healthy system — the console showed a green all-clear while the query that
      // feeds it was erroring.
      console.error('[AdminSystemAlerts] DB query error:', sanitizeErrorMessage(queryErr.message))
      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'admin',
          kind: 'db_unavailable',
          operation: 'admin.alerts_query',
          summary: 'System alerts could not be read from the database',
          nextAction:
            'The alerts console cannot show incidents while this fails. Check Supabase availability before trusting an empty alert list.',
          details: { error: sanitizeErrorMessage(queryErr.message) },
        })
      } catch {
        // Non-fatal logger fallback
      }
      return NextResponse.json(
        {
          success: false,
          code: 'ALERTS_QUERY_FAILED',
          // Admins keep the database error text — it is the diagnostic — but any
          // connection string or credential inside it is redacted first.
          error: `Unable to load system alerts: ${sanitizeErrorMessage(queryErr.message)}`,
        },
        { status: 500 }
      )
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
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.system.alerts.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/system/alerts',
  },
  async ({ request, actor }) => {
  const admin = requireAdmin(actor)
  try {
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
      return NextResponse.json({ error: sanitizeErrorMessage(updateErr.message) }, { status: 400 })
    }

    const targetId = alertId || fingerprint || 'group'
    await logAdminAction(admin.userId, admin.email, `system_alert_${newStatus}`, 'system_error', targetId, { newStatus, alertId, fingerprint })

    return NextResponse.json({ success: true, message: `Alert status updated to ${newStatus}` })
  } catch (err) {
    console.error('[AdminSystemAlerts] Exception updating alert status:', err)
    return NextResponse.json({ error: 'Internal server error while updating alert.' }, { status: 500 })
  }
  }
)
