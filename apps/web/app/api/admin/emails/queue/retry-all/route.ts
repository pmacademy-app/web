import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { statusFilter = 'failed_and_dead_letter', limit = 100 } = body
    const maxLimit = Math.min(200, Math.max(1, Number(limit) || 100))

    const targetStatuses =
      statusFilter === 'failed'
        ? ['failed']
        : statusFilter === 'dead_letter'
        ? ['dead_letter']
        : ['failed', 'dead_letter', 'retrying']

    const supabase = createServiceRoleClient()

    // 1. Fetch eligible items
    const { data: rawItems, error: fetchErr } = await supabase
      .from('email_queue')
      .select('id, to_email, template_key, status')
      .in('status', targetStatuses)
      .order('created_at', { ascending: false })
      .limit(maxLimit)

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    }

    const items = (rawItems || []) as Array<{ id: string; to_email: string; template_key: string; status: string }>
    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        retried: 0,
        skipped: 0,
        message: 'No eligible failed or dead-letter items found to retry.',
      })
    }

    // 2. Fetch suppressions
    const emails = Array.from(new Set(items.map((i) => i.to_email)))
    const { data: suppressions } = await supabase
      .from('email_suppressions')
      .select('email')
      .in('email', emails)

    const suppressedSet = new Set((suppressions || []).map((s: { email: string }) => s.email.toLowerCase()))

    const eligibleIds: string[] = []
    const suppressedIds: string[] = []

    for (const item of items) {
      const isCritical = item.template_key === 'auth.verify_email' || item.template_key === 'auth.password_reset'
      if (!isCritical && suppressedSet.has(item.to_email.toLowerCase())) {
        suppressedIds.push(item.id)
      } else {
        eligibleIds.push(item.id)
      }
    }

    const now = new Date().toISOString()

    // Mark suppressed items
    if (suppressedIds.length > 0) {
      await supabase
        .from('email_queue')
        .update({
          status: 'suppressed',
          skipped_reason: 'email_suppressed',
          updated_at: now,
        })
        .in('id', suppressedIds)
    }

    // Requeue eligible items atomically
    let retriedCount = 0
    if (eligibleIds.length > 0) {
      const { error: updateErr, count } = await supabase
        .from('email_queue')
        .update({
          status: 'pending',
          attempt_count: 0,
          error_message: null,
          failed_at: null,
          scheduled_at: now,
          updated_at: now,
        }, { count: 'exact' })
        .in('id', eligibleIds)
        .in('status', targetStatuses)

      if (!updateErr) {
        retriedCount = count || eligibleIds.length
      }
    }

    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'email_queue_retry_all',
      'email_queue',
      undefined,
      {
        matchedCount: items.length,
        retriedCount,
        suppressedCount: suppressedIds.length,
        statusFilter,
      }
    )

    return NextResponse.json({
      success: true,
      matched: items.length,
      retried: retriedCount,
      skipped: items.length - retriedCount,
      message: `Successfully requeued ${retriedCount} email(s) for delivery.`,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retry all failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
