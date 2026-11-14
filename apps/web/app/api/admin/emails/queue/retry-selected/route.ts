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
    operation: 'admin.emails.queue.retry_selected.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue/retry-selected',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)

    let body: { ids?: unknown }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as { ids?: unknown }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { ids } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new RouteError(400, 'VALIDATION', 'ids must be a non-empty array of strings')
    }

    const safeIds = ids.slice(0, 100).filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    const supabase = createServiceRoleClient()

    const staleThresholdMs = 15 * 60 * 1000
    const staleThresholdIso = new Date(Date.now() - staleThresholdMs).toISOString()

    // 1. Fetch eligible items (not delivered or active processing)
    const { data: rawItems, error: fetchErr } = await supabase
      .from('email_queue')
      .select('id, to_email, template_key, template_variables, status, processing_at')
      .in('id', safeIds)
      .or(`status.in.(failed,dead_letter,retrying,skipped,suppressed),and(status.eq.processing,processing_at.lte.${staleThresholdIso})`)

    if (fetchErr) {
      throw new Error(`Database error fetching queue items: ${fetchErr.message}`)
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
        requested: safeIds.length,
        retried: 0,
        skipped: safeIds.length,
        message: 'No eligible failed/dead-letter items found to retry.',
      })
    }

    // 2. Fetch suppressions
    const emails = Array.from(new Set(items.map((i) => i.to_email)))
    const { data: suppressions, error: suppErr } = await supabase
      .from('email_suppressions')
      .select('email')
      .in('email', emails)

    if (suppErr) {
      throw new Error(`Database error fetching suppressions: ${suppErr.message}`)
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
          requested: safeIds.length,
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
      const { error: updateErr, count } = await supabase
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
        .or(`status.in.(failed,dead_letter,retrying,skipped,suppressed),and(status.eq.processing,processing_at.lte.${staleThresholdIso})`)

      if (updateErr) {
        throw new Error(`Failed to requeue emails: ${updateErr.message}`)
      }
      retriedCount = typeof count === 'number' ? count : eligibleIds.length
    }

    await logAdminAction(
      admin.userId,
      admin.email || 'admin@prodily.me',
      'email_queue_batch_retried',
      'email_queue',
      undefined,
      {
        requestedCount: safeIds.length,
        retriedCount,
        suppressedCount: suppressedIds.length,
        expiredAuthCount: expiredAuthIds.length,
      }
    )

    revalidateAdminShell()
    return NextResponse.json({
      success: true,
      requested: safeIds.length,
      retried: retriedCount,
      skipped: safeIds.length - retriedCount,
      expired: expiredAuthIds.length,
      message: `Successfully requeued ${retriedCount} email(s) for delivery.${expiredAuthNote(expiredAuthIds.length)}`,
    })
  }
)

/** Tells the admin how many selected auth emails were left alone because they expired. */
function expiredAuthNote(count: number): string {
  return count > 0
    ? ` ${count} sign-in email(s) expired and were not requeued. Ask the learner to request a new one.`
    : ''
}
