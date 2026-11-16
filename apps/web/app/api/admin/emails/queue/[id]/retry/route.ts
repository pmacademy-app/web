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
    operation: 'admin.emails.queue.id.retry.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/queue/[id]/retry',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    const { id } = params
    const supabase = createServiceRoleClient()

    // 1. Fetch current queue item
    const { data: item, error: fetchErr } = await supabase
      .from('email_queue')
      .select('id, to_email, template_key, template_variables, status, attempt_count, processing_at')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) {
      throw new Error(`Database error fetching queue item: ${fetchErr.message}`)
    }
    if (!item) {
      throw new RouteError(404, 'NOT_FOUND', 'Queue item not found.')
    }

    // 2. State invariant: Delivered items cannot be retried
    if (item.status === 'delivered') {
      throw new RouteError(400, 'BAD_REQUEST', `Cannot retry queue item in '${item.status}' status.`)
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
      throw new RouteError(
        400,
        'BAD_REQUEST',
        'Cannot retry queue item currently being processed by an active worker.'
      )
    }

    // ADR-005: a dead-lettered auth email has its variables (and its one-time link)
    // scrubbed. Requeueing it would send a broken link, and the original had expired.
    if (isExpiredAuthQueueRow(item.template_key, item.template_variables)) {
      throw new RouteError(409, 'CONFLICT', AUTH_EMAIL_EXPIRED_RETRY_MESSAGE)
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

        throw new RouteError(
          400,
          'SUPPRESSED',
          `Recipient '${item.to_email}' is on the suppression list. Item marked as suppressed.`
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
      throw new Error(`Failed to requeue item: ${updateErr.message}`)
    }
    if (!updated) {
      throw new RouteError(
        409,
        'CONFLICT',
        'Failed to requeue item. It may have already been claimed or transitioned by a concurrent process.'
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

    revalidateAdminShell()
    return NextResponse.json({
      success: true,
      message: `Email to ${item.to_email} requeued for delivery.`,
    })
  }
)
