import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { revalidateAdminShell } from '@/lib/admin/cache-tags'
import {
  AUTH_EMAIL_EXPIRED_RETRY_MESSAGE,
  isExpiredAuthQueueRow,
} from '@/lib/notifications/queue/helpers'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.queue.retry_all.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue/retry-all',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
    let body: { statusFilter?: string; limit?: unknown } = {}
    // Targeted parse: bad JSON is treated as empty body or validation refusal.
    try {
      body = (await request.json().catch(() => ({}))) as { statusFilter?: string; limit?: unknown }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }
    const { statusFilter = 'failed_and_dead_letter', limit = 100 } = body
    const maxLimit = Math.min(200, Math.max(1, Number(limit) || 100))

    const staleThresholdMs = 15 * 60 * 1000
    const staleThresholdIso = new Date(Date.now() - staleThresholdMs).toISOString()

    const targetStatuses =
      statusFilter === 'failed'
        ? ['failed']
        : statusFilter === 'dead_letter'
        ? ['dead_letter']
        : statusFilter === 'stale_processing'
        ? ['processing']
        : ['failed', 'dead_letter', 'retrying']

    const supabase = createServiceRoleClient()

    // 1. Fetch eligible items
    let fetchQuery = supabase
      .from('email_queue')
      .select('id, to_email, template_key, template_variables, status, processing_at')
      .in('status', targetStatuses)

    if (statusFilter === 'stale_processing') {
      fetchQuery = fetchQuery.lte('processing_at', staleThresholdIso)
    }

    const { data: rawItems, error: fetchErr } = await fetchQuery
      .order('created_at', { ascending: false })
      .limit(maxLimit)

    if (fetchErr) {
      throw new Error(`Database error fetching eligible queue items: ${fetchErr.message}`)
    }

    const items = (rawItems || []) as Array<{
      id: string
      to_email: string
      template_key: string
      template_variables: unknown
      status: string
    }>
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
    const { data: suppressions, error: suppErr } = await supabase
      .from('email_suppressions')
      .select('email')
      .in('email', emails)

    if (suppErr) {
      throw new Error(`Database error fetching email suppressions: ${suppErr.message}`)
    }

    const suppressedSet = new Set((suppressions || []).map((s: { email: string }) => s.email.toLowerCase()))

    const eligibleIds: string[] = []
    const suppressedIds: string[] = []
    // ADR-005: auth emails whose variables were scrubbed at dead-letter time. Requeueing
    // them would send a broken link, so they are left as they are and reported.
    const expiredAuthIds: string[] = []

    for (const item of items) {
      if (isExpiredAuthQueueRow(item.template_key, item.template_variables)) {
        expiredAuthIds.push(item.id)
        continue
      }
      const isCritical = item.template_key === 'auth.verify_email' || item.template_key === 'auth.password_reset'
      if (!isCritical && suppressedSet.has(item.to_email.toLowerCase())) {
        suppressedIds.push(item.id)
      } else {
        eligibleIds.push(item.id)
      }
    }

    // Every match was an expired auth email: nothing to requeue, so say why.
    if (expiredAuthIds.length > 0 && eligibleIds.length === 0 && suppressedIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          matched: items.length,
          retried: 0,
          expired: expiredAuthIds.length,
          error: AUTH_EMAIL_EXPIRED_RETRY_MESSAGE,
        },
        { status: 409 }
      )
    }

    const now = new Date().toISOString()

    // Mark suppressed items
    if (suppressedIds.length > 0) {
      const { error: markSuppErr } = await supabase
        .from('email_queue')
        .update({
          status: 'suppressed',
          skipped_reason: 'email_suppressed',
          updated_at: now,
        })
        .in('id', suppressedIds)

      if (markSuppErr) {
        throw new Error(`Database error marking suppressed items: ${markSuppErr.message}`)
      }
    }

    // Requeue eligible items atomically
    let retriedCount = 0
    if (eligibleIds.length > 0) {
      let updateBuilder = supabase
        .from('email_queue')
        .update({
          status: 'pending',
          attempt_count: 0,
          error_message: null,
          failed_at: null,
          scheduled_at: now,
          // `claim_email_queue_items` only claims rows where
          // `next_retry_at IS NULL OR next_retry_at <= NOW()`, and skips rows still
          // marked as being processed. Leaving either set meant a "requeued" item sat
          // unclaimable for the remainder of its backoff (up to 1h after a quota
          // deferral) while the admin was told it had been retried.
          next_retry_at: null,
          processing_at: null,
          updated_at: now,
        }, { count: 'exact' })
        .in('id', eligibleIds)
        .in('status', targetStatuses)

      if (statusFilter === 'stale_processing') {
        updateBuilder = updateBuilder.lte('processing_at', staleThresholdIso)
      }

      const { error: updateErr, count } = await updateBuilder

      if (updateErr) {
        throw new Error(`Failed to requeue emails: ${updateErr.message}`)
      }
      retriedCount = typeof count === 'number' ? count : eligibleIds.length
    }

    await logAdminAction(
      admin.userId,
      admin.email || 'admin@prodily.me',
      'email_queue_retry_all',
      'email_queue',
      undefined,
      {
        matchedCount: items.length,
        retriedCount,
        suppressedCount: suppressedIds.length,
        expiredAuthCount: expiredAuthIds.length,
        statusFilter,
      }
    )

    // Suppressions and requeues both move rows out of `failed`.
    revalidateAdminShell()

    // Matched rows but requeued none: the rows changed status underneath us. Report
    // that rather than a green "requeued 0".
    if (items.length > 0 && retriedCount === 0 && suppressedIds.length === 0) {
      return NextResponse.json(
        {
          success: false,
          matched: items.length,
          retried: 0,
          skipped: items.length,
          error: 'No emails were requeued: matching items changed status before the update was applied. Refresh and try again.',
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      matched: items.length,
      retried: retriedCount,
      skipped: items.length - retriedCount,
      expired: expiredAuthIds.length,
      message: `Successfully requeued ${retriedCount} email(s) for delivery.${expiredAuthNote(expiredAuthIds.length)}`,
    })
  }
)

/** Tells the admin how many matched auth emails were left alone because they expired. */
function expiredAuthNote(count: number): string {
  return count > 0
    ? ` ${count} sign-in email(s) expired and were not requeued. Ask the learner to request a new one.`
    : ''
}
