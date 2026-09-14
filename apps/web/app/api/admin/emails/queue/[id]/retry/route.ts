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
    operation: 'admin.emails.queue.id.retry.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue/[id]/retry',
  },
  async ({ actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { id } = params
      const supabase = createServiceRoleClient()

      // 1. Fetch current queue item
      const { data: item, error: fetchErr } = await supabase
        .from('email_queue')
        .select('id, to_email, template_key, status, attempt_count, processing_at')
        .eq('id', id)
        .maybeSingle()

      if (fetchErr || !item) {
        return NextResponse.json({ error: 'Queue item not found.' }, { status: 404 })
      }

      // 2. State invariant: Delivered items cannot be retried
      if (item.status === 'delivered') {
        return NextResponse.json(
          { error: `Cannot retry queue item in '${item.status}' status.` },
          { status: 400 }
        )
      }

      // B6: Active processing items (<15m) cannot be retried to avoid duplicate concurrent sends.
      // Stale processing items (>=15m) whose worker lease expired can be safely reclaimed.
      const staleThresholdMs = 15 * 60 * 1000
      const isProcessing = item.status === 'processing'
      const isStaleProcessing =
        isProcessing &&
        item.processing_at &&
        Date.now() - new Date(item.processing_at).getTime() >= staleThresholdMs

      if (isProcessing && !isStaleProcessing) {
        return NextResponse.json(
          { error: 'Cannot retry queue item currently being processed by an active worker.' },
          { status: 400 }
        )
      }

      const isCritical = item.template_key === 'auth.verify_email' || item.template_key === 'auth.password_reset'

      // 3. Suppression check (for non-critical emails)
      if (!isCritical) {
        const { data: suppression } = await supabase
          .from('email_suppressions')
          .select('id')
          .eq('email', item.to_email)
          .maybeSingle()

        if (suppression) {
          await supabase
            .from('email_queue')
            .update({
              status: 'suppressed',
              skipped_reason: 'email_suppressed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)

          return NextResponse.json(
            { error: `Recipient '${item.to_email}' is on the suppression list. Item marked as suppressed.` },
            { status: 400 }
          )
        }
      }

      // 4. Atomic Re-queue
      const now = new Date().toISOString()
      const staleThresholdIso = new Date(Date.now() - staleThresholdMs).toISOString()

      let updateBuilder = supabase
        .from('email_queue')
        .update({
          status: 'pending',
          attempt_count: 0,
          error_message: null,
          failed_at: null,
          scheduled_at: now,
          next_retry_at: null,
          processing_at: null,
          updated_at: now,
        })
        .eq('id', id)

      if (isStaleProcessing) {
        updateBuilder = updateBuilder
          .eq('status', 'processing')
          .lte('processing_at', staleThresholdIso)
      } else {
        updateBuilder = updateBuilder
          .in('status', ['failed', 'dead_letter', 'retrying', 'skipped', 'suppressed'])
      }

      const { data: updated, error: updateErr } = await updateBuilder
        .select('id, status')
        .maybeSingle()

      // A database error and a concurrent status change are different failures and must
      // not be collapsed into one ambiguous 409.
      if (updateErr) {
        return NextResponse.json(
          { success: false, error: `Failed to requeue item: ${sanitizeErrorMessage(updateErr.message)}` },
          { status: 500 }
        )
      }
      if (!updated) {
        return NextResponse.json(
          { success: false, error: 'Failed to requeue item. It may have already been claimed or transitioned by a concurrent process.' },
          { status: 409 }
        )
      }

      await logAdminAction(
        admin.userId,
        admin.email || 'admin@prodily.me',
        'email_queue_retried',
        'email_queue',
        id,
        {
          toEmail: item.to_email,
          templateKey: item.template_key,
          previousStatus: item.status,
        }
      )

      return NextResponse.json({
        success: true,
        message: `Email to ${item.to_email} requeued for delivery.`,
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Retry failed')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
