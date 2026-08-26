import type { NotificationPriorityLevel, NotificationChannel, NotificationCategory } from '../types'
import { PRIORITY_MATRIX } from '../constants'
import { globalFeatureFlagService } from '../feature-flags/service'
import { createDefaultNotificationPreferences, isChannelEnabledByPreferences } from '../preferences/defaults'
import { globalPriorityMatrix } from '../priority/matrix'
import { globalProviderRegistry } from '../providers'
import { renderEmailTemplate } from '../../../emails'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '../automations/service'
import type { EmailAutomationKey } from '../automations/types'

export interface EnqueueNotificationParams {
  userId: string
  toEmail: string
  toName?: string
  channel: NotificationChannel
  templateKey: string
  templateVariables: Record<string, unknown>
  eventId?: string
  eventType: string
  category: NotificationCategory
  priorityLevel?: NotificationPriorityLevel
  /** Optional broadcast ID — tags the email_queue row for deduplication and stats. */
  broadcastId?: string
}

/**
 * Enqueues a notification item into the persistent Supabase database table `email_queue`.
 * Validates Feature Flags, Admin Automations, Global Pause, User Preferences, and Duplicate Prevention.
 */
export async function enqueueNotificationItem(
  params: EnqueueNotificationParams
): Promise<{ success: boolean; queueId?: string; reason?: string }> {
  const priorityLevel = params.priorityLevel || 'medium'
  const priorityDef = PRIORITY_MATRIX[priorityLevel]
  const supabase = createServiceRoleClient()

  // 1. Feature Flag Check
  const emailEnabled = globalFeatureFlagService.isEnabled('EMAIL_ENABLED')
  if (params.channel === 'email' && !emailEnabled) {
    await recordSkippedEvent(supabase, params, 'email_system_disabled_via_flags')
    return { success: false, reason: 'Email system is disabled via Feature Flags' }
  }

  // 2. Admin Automation Toggle Check (Non-critical emails only)
  const isCritical = params.templateKey === 'auth.verify_email' || params.templateKey === 'auth.password_reset'
  if (!isCritical) {
    const isAutomationEnabled = await EmailAutomationsService.isAutomationEnabled(params.templateKey as EmailAutomationKey)
    if (!isAutomationEnabled) {
      await recordSkippedEvent(supabase, params, `automation_disabled:${params.templateKey}`)
      return { success: false, reason: `Admin email automation for '${params.templateKey}' is disabled` }
    }

    const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
    if (isGlobalPause) {
      await recordSkippedEvent(supabase, params, 'global_pause_active')
      return { success: false, reason: 'Global non-critical email pause is active' }
    }
  }

  // 3. User Preferences Check
  const allowBypass = globalPriorityMatrix.evaluatePreferenceBypass(priorityLevel)
  if (!allowBypass && !isCritical) {
    const userPrefs = createDefaultNotificationPreferences(params.userId)
    const isAllowed = isChannelEnabledByPreferences(userPrefs, params.category, params.channel)
    if (!isAllowed) {
      await recordSkippedEvent(supabase, params, `user_preference_disabled:${params.category}`)
      return { success: false, reason: `User disabled '${params.category}' notifications for channel '${params.channel}'` }
    }
  }

  // 4. Idempotency / Duplicate Prevention Check
  if (params.broadcastId) {
    try {
      const { data: rawExistingBroadcast } = await supabase
        .from('email_queue')
        .select('id')
        .eq('broadcast_id', params.broadcastId)
        .eq('user_id', params.userId)
        .maybeSingle()

      const existingB = rawExistingBroadcast as { id: string } | null
      if (existingB && existingB.id) {
        await recordSkippedEvent(supabase, params, 'duplicate_broadcast_user')
        return { success: false, reason: 'Duplicate notification for broadcast already queued or delivered', queueId: existingB.id }
      }
    } catch {
      // Fall through to insert
    }
  } else if (params.eventId) {
    try {
      const { data: rawExisting } = await supabase
        .from('email_queue')
        .select('id')
        .eq('user_id', params.userId)
        .eq('template_key', params.templateKey)
        .eq('event_type', params.eventType)
        .in('status', ['pending', 'processing', 'delivered'])
        .maybeSingle()

      const existing = rawExisting as { id: string } | null
      if (existing && existing.id) {
        await recordSkippedEvent(supabase, params, 'duplicate_event_id')
        return { success: false, reason: 'Duplicate notification event already queued or delivered', queueId: existing.id }
      }
    } catch {
      // Fall through to insert if table query has temporary glitch
    }
  }

  // 5. Insert into Supabase email_queue Table
  const now = new Date().toISOString()
  try {
    const { data: inserted, error } = await supabase
      .from('email_queue')
      .insert({
        user_id: params.userId,
        to_email: params.toEmail,
        to_name: params.toName || null,
        template_key: params.templateKey,
        template_variables: (params.templateVariables as unknown as import('@/lib/supabase').Json),
        event_id: (params.eventId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.eventId)) ? params.eventId : null,
        event_type: params.eventType,
        priority: priorityDef.numericValue,
        status: 'pending',
        attempt_count: 0,
        max_attempts: priorityDef.maxRetries,
        scheduled_at: now,
        created_at: now,
        updated_at: now,
        broadcast_id: params.broadcastId || null,
      })
      .select('id')
      .single()

    const rawInserted = inserted as { id: string } | null
    if (error || !rawInserted) {
      if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
        await recordSkippedEvent(supabase, params, 'duplicate_db_constraint')
        return { success: false, reason: 'Duplicate notification prevented by database unique constraint' }
      }
      return { success: false, reason: `Failed to insert queue record: ${error?.message || 'Unknown error'}` }
    }

    // Near-real-time queue flush for high/critical priority transactional items (e.g. Welcome email)
    if ((priorityLevel === 'high' || priorityLevel === 'critical') && process.env.NODE_ENV !== 'test') {
      try {
        processEmailQueue(5).catch((err) => {
          console.warn('[enqueueNotificationItem] Non-fatal background queue process error:', err)
        })
      } catch {
        // Non-fatal background trigger
      }
    }

    return {
      success: true,
      queueId: rawInserted.id,
    }
  } catch (err) {
    return { success: false, reason: `Database insert exception: ${err instanceof Error ? err.message : 'Unknown'}` }
  }
}

/**
 * Logs an auditable skipped event to notification_events for admin diagnostics.
 */
async function recordSkippedEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  params: EnqueueNotificationParams,
  skippedReason: string
): Promise<void> {
  try {
    await supabase.from('notification_events').insert({
      event_type: params.eventType,
      user_id: params.userId,
      payload: {
        templateKey: params.templateKey,
        toEmail: params.toEmail,
        ...params.templateVariables,
      },
      channels_notified: [],
      skipped_reason: skippedReason,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Non-fatal logging helper
  }
}

/**
 * Processes a batch of pending emails from the persistent Supabase `email_queue`.
 * Claims rows atomically using PostgreSQL RPC claim_email_queue_items(batchSize).
 */
export async function processEmailQueue(
  batchSize: number = 50
): Promise<{ processed: number; delivered: number; failed: number; suppressed: number; skipped: number }> {
  // Check Global Queue Processing Feature Flag
  const processingEnabled = globalFeatureFlagService.isEnabled('QUEUE_PROCESSING_ENABLED')
  if (!processingEnabled) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }
  }

  const supabase = createServiceRoleClient()
  let claimedRows: Array<Record<string, unknown>> = []

  // 1. Atomic PostgreSQL Row Claiming via RPC (FOR UPDATE SKIP LOCKED)
  try {
    const { data, error } = await supabase.rpc('claim_email_queue_items', { p_batch_size: batchSize })
    if (error || !data) {
      console.warn('[processEmailQueue] RPC claim_email_queue_items warning/fallback:', error?.message)
      // Fallback: SELECT + UPDATE for environments where RPC migration is pending
      const { data: rawRows } = await supabase
        .from('email_queue')
        .select('*')
        .in('status', ['pending', 'retrying'])
        .lte('scheduled_at', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('scheduled_at', { ascending: true })
        .limit(batchSize)

      if (rawRows && rawRows.length > 0) {
        const ids = rawRows.map((r: Record<string, unknown>) => String(r.id))
        await supabase
          .from('email_queue')
          .update({ status: 'processing', processing_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .in('id', ids)

        claimedRows = rawRows
      }
    } else {
      claimedRows = data as Array<Record<string, unknown>>
    }
  } catch (err) {
    console.error('[processEmailQueue] Failed to claim queue items:', err)
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }
  }

  if (claimedRows.length === 0) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }
  }

  const automationsState = await EmailAutomationsService.getState()
  let deliveredCount = 0
  let failedCount = 0
  let suppressedCount = 0
  let skippedCount = 0

  for (const rawItem of claimedRows) {
    const queueId = String(rawItem.id)
    const userId = String(rawItem.user_id)
    const toEmail = String(rawItem.to_email)
    const toName = rawItem.to_name ? String(rawItem.to_name) : undefined
    const templateKey = String(rawItem.template_key)
    const templateVariables = (rawItem.template_variables || {}) as Record<string, unknown>
    const attemptCount = Number(rawItem.attempt_count || 1)
    const maxAttempts = Number(rawItem.max_attempts || 3)

    const isCritical = templateKey === 'auth.verify_email' || templateKey === 'auth.password_reset'

    // A. Check Global Pause (Optional emails only)
    if (!isCritical && automationsState.globalPause) {
      await updateItemSkipped(supabase, queueId, 'global_pause_active')
      skippedCount++
      continue
    }

    // B. Check Individual Automation Setting (Optional emails only)
    if (!isCritical) {
      const isEnabled = await EmailAutomationsService.isAutomationEnabled(templateKey as EmailAutomationKey)
      if (!isEnabled) {
        await updateItemSkipped(supabase, queueId, `automation_disabled:${templateKey}`)
        skippedCount++
        continue
      }
    }

    // C. Check Suppression (Optional emails only — critical auth emails bypass suppression)
    const { data: suppression } = await supabase.from('email_suppressions').select('id').eq('email', toEmail).maybeSingle()
    if (suppression && !isCritical) {
      await supabase.from('email_queue').update({ status: 'suppressed', skipped_reason: 'email_suppressed', updated_at: new Date().toISOString() }).eq('id', queueId)
      suppressedCount++
      continue
    }

    // D. Render Template
    let renderedHtml = ''
    let renderedText = ''
    let subject = ''
    try {
      const rendered = await renderEmailTemplate(templateKey, templateVariables)
      renderedHtml = rendered.html
      renderedText = rendered.text
      subject = rendered.subject
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Template render failure'
      await handlePermanentFailure(supabase, queueId, userId, templateKey, templateVariables, `Template Render Error: ${errorMsg}`, attemptCount)
      failedCount++
      continue
    }

    // E. Dispatch via Resend Provider
    const provider = globalProviderRegistry.getProvider('resend')
    if (!provider) {
      await handleRetryableFailure(supabase, queueId, 'Resend provider not registered', attemptCount, maxAttempts)
      failedCount++
      continue
    }

    const sendResult = await provider.send({
      recipient: { userId, email: toEmail, name: toName },
      channel: 'email',
      templateKey,
      templateVersion: 1,
      variables: {
        ...templateVariables,
        subject,
        html: renderedHtml,
        text: renderedText,
      },
    })

    if (sendResult.success) {
      // F. Post-Resend Acceptance: Increment Daily Quota ONLY on Successful Resend Acceptance
      if (!isCritical) {
        try {
          await supabase.rpc('increment_daily_email_quota', { p_limit: automationsState.dailyLimit })
        } catch {
          // Non-fatal quota logging warning
        }
      }

      await supabase.from('email_queue')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          resend_id: sendResult.externalId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId)

      deliveredCount++
    } else {
      await handleRetryableFailure(supabase, queueId, sendResult.error || 'Provider send failed', attemptCount, maxAttempts)
      failedCount++
    }
  }

  return {
    processed: claimedRows.length,
    delivered: deliveredCount,
    failed: failedCount,
    suppressed: suppressedCount,
    skipped: skippedCount,
  }
}

async function updateItemSkipped(
  supabase: ReturnType<typeof createServiceRoleClient>,
  queueId: string,
  reason: string
): Promise<void> {
  await supabase.from('email_queue')
    .update({ status: 'skipped', skipped_reason: reason, updated_at: new Date().toISOString() })
    .eq('id', queueId)
}

async function handleRetryableFailure(
  supabase: ReturnType<typeof createServiceRoleClient>,
  queueId: string,
  errorMessage: string,
  attemptCount: number,
  maxAttempts: number
): Promise<void> {
  const now = new Date()
  const nextRetryMinutes = Math.pow(2, attemptCount) * 5 // 10m, 20m, 40m
  const nextRetryAt = new Date(now.getTime() + nextRetryMinutes * 60 * 1000).toISOString()

  if (attemptCount >= maxAttempts) {
    await handlePermanentFailure(supabase, queueId, '', '', {}, `Max retries (${maxAttempts}) exceeded. Last error: ${errorMessage}`, attemptCount)
  } else {
    await supabase.from('email_queue')
      .update({
        status: 'retrying',
        error_message: errorMessage,
        next_retry_at: nextRetryAt,
        failed_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', queueId)
  }
}

async function handlePermanentFailure(
  supabase: ReturnType<typeof createServiceRoleClient>,
  queueId: string,
  userId: string,
  templateKey: string,
  templateVariables: Record<string, unknown>,
  failureReason: string,
  attemptCount: number
): Promise<void> {
  const now = new Date().toISOString()
  await supabase.from('email_queue')
    .update({ status: 'dead_letter', error_message: failureReason, failed_at: now, updated_at: now })
    .eq('id', queueId)

  try {
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'error',
      category: 'queue',
      operation: 'dead_letter_drop',
      message: failureReason,
      queueId,
      templateKey,
      userId,
    })
  } catch {
    // Non-fatal logging fallback
  }

  try {
    await supabase.from('email_dead_letter').insert({
      original_queue_id: queueId,
      user_id: userId || null,
      template_key: templateKey || 'unknown',
      template_variables: ((templateVariables || {}) as unknown as import('@/lib/supabase').Json),
      failure_reason: failureReason,
      all_errors: ([{ attempt: attemptCount, error: failureReason, timestamp: now }] as unknown as import('@/lib/supabase').Json),
      created_at: now,
    })
  } catch {
    // Non-fatal dead letter insert fallback
  }
}
