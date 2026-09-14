import { sanitizeErrorMessage } from '@/lib/monitoring/redaction'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.queue.retry_selected.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue/retry-selected',
  },
  async ({ request, actor }) => {
    try {
      const admin = requireAdmin(actor)
      const body = await request.json()
      const { ids } = body

      if (!Array.isArray(ids) || ids.length === 0) {
        return NextResponse.json({ error: 'ids must be a non-empty array of strings' }, { status: 400 })
      }

      const safeIds = ids.slice(0, 100).filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      const supabase = createServiceRoleClient()

      const staleThresholdMs = 15 * 60 * 1000
      const staleThresholdIso = new Date(Date.now() - staleThresholdMs).toISOString()

      // 1. Fetch eligible items (not delivered or active processing)
      const { data: rawItems, error: fetchErr } = await supabase
        .from('email_queue')
        .select('id, to_email, template_key, status, processing_at')
        .in('id', safeIds)
        .or(`status.in.(failed,dead_letter,retrying,skipped,suppressed),and(status.eq.processing,processing_at.lte.${staleThresholdIso})`)

      if (fetchErr) {
        return NextResponse.json({ error: sanitizeErrorMessage(fetchErr.message) }, { status: 500 })
      }

      const items = (rawItems || []) as Array<{ id: string; to_email: string; template_key: string; status: string }>
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
          return NextResponse.json(
            { success: false, error: `Failed to requeue emails: ${sanitizeErrorMessage(updateErr.message)}` },
            { status: 500 }
          )
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
        }
      )

      return NextResponse.json({
        success: true,
        requested: safeIds.length,
        retried: retriedCount,
        skipped: safeIds.length - retriedCount,
        message: `Successfully requeued ${retriedCount} email(s) for delivery.`,
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Batch retry failed')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
