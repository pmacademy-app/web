import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { sanitizeErrorMessage } from '@/lib/monitoring/redaction'
import { clampPagination, paginated, toRange } from '@/lib/api/pagination'

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
    // B13-B: `limit` with no `offset` meant an operator could widen the page but never
    // page past it — older alerts were simply unreachable.
    const page = clampPagination({
      limit: searchParams.get('limit'),
      offset: searchParams.get('offset'),
    })
    const { from, to } = toRange(page)

    const supabase = createServiceRoleClient()

    let query = supabase.from('system_errors')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false })
      .range(from, to)

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }
    if (severity && severity !== 'all') {
      query = query.eq('severity', severity)
    }
    if (category && category !== 'all') {
      query = query.eq('category', category)
    }

    const { data: errors, error: queryErr, count } = await query

    if (queryErr) {
      // A failed alerts query must NEVER be rendered as "no alerts". Returning an
      // empty success made a broken monitoring pipeline indistinguishable from a
      // healthy system — the console showed a green all-clear while the query that
      // feeds it was erroring.
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
      throw new RouteError(
        500,
        'ALERTS_QUERY_FAILED',
        `Unable to load system alerts: ${sanitizeErrorMessage(queryErr.message)}`
      )
    }

    // Also get unacknowledged critical alert count
    const { count: unackCritical } = await supabase.from('system_errors')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('severity', 'critical')

    // `alerts` is kept alongside the contract envelope so AdminSystemAlertsView keeps
    // reading the key it already reads; `items` is the contract, `alerts` is the alias.
    const body = paginated(errors || [], page, count)
    return NextResponse.json({
      success: true,
      ...body,
      alerts: body.items,
      unacknowledgedCriticalCount: unackCritical || 0,
    })
  } catch (err) {
    if (err instanceof RouteError) throw err
    throw err
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
      throw new RouteError(400, 'INVALID_INPUT', 'Valid alertId or fingerprint and newStatus are required.')
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
      throw new RouteError(400, 'ALERT_UPDATE_FAILED', sanitizeErrorMessage(updateErr.message))
    }

    const targetId = alertId || fingerprint || 'group'
    await logAdminAction(admin.userId, admin.email, `system_alert_${newStatus}`, 'system_error', targetId, { newStatus, alertId, fingerprint })

    return NextResponse.json({ success: true, message: `Alert status updated to ${newStatus}` })
  } catch (err) {
    if (err instanceof RouteError) throw err
    throw err
  }
  }
)
