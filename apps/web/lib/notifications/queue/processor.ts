import type { NotificationPriorityLevel, NotificationChannel, NotificationCategory } from '../types'
import { PRIORITY_MATRIX } from '../constants'
import { globalFeatureFlagService } from '../feature-flags/service'
import { createDefaultNotificationPreferences, isChannelEnabledByPreferences } from '../preferences/defaults'
import { globalPriorityMatrix } from '../priority/matrix'
import { globalProviderRegistry, sendEmailWithFailover } from '../providers'
import type { ProviderSendResult } from '../providers/types'
import { renderEmailTemplate } from '../../../emails'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '../automations/service'
import type { EmailAutomationKey } from '../automations/types'

/** Backoff base used when the admin setting is unavailable or invalid. */
const DEFAULT_RETRY_DELAY_MINUTES = 5

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

  // 1. Feature Flag Check — read through to the persisted flag set so an admin
  // disabling EMAIL_ENABLED actually stops enqueueing on every serverless instance.
  const emailEnabled = await globalFeatureFlagService.isEnabledAsync('EMAIL_ENABLED')
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
  // Check Global Queue Processing Feature Flag (persisted, not per-process default)
  const processingEnabled = await globalFeatureFlagService.isEnabledAsync('QUEUE_PROCESSING_ENABLED')
  if (!processingEnabled) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0 }
  }

  const supabase = createServiceRoleClient()
  let claimedRows: Array<Record<string, unknown>> = []

  // 1. Atomic PostgreSQL Row Claiming via RPC (FOR UPDATE SKIP LOCKED)
  try {
    const { data, error } = await supabase.rpc('claim_email_queue_items', { p_batch_size: batchSize })
    if (error || !data) {
      // The atomic RPC is the supported path. Falling back here is a degraded mode that
      // means a migration is missing, so make it loud instead of silently limping.
      console.warn('[processEmailQueue] RPC claim_email_queue_items unavailable, using degraded fallback claim:', error?.message)
      try {
        const { logErrorReport } = await import('@/lib/monitoring/logger')
        void logErrorReport({
          domain: 'queue',
          kind: 'config_missing',
          operation: 'queue.claim_rpc_unavailable',
          summary: 'Queue claim RPC is unavailable; using the non-atomic fallback claim',
          nextAction:
            'Apply the pending database migration that creates claim_email_queue_items. Until then queue claiming is not concurrency-safe.',
          details: { error: error?.message || 'unknown error' },
        })
      } catch {
        // Non-fatal logging fallback
      }

      const nowIso = new Date().toISOString()
      const { data: rawRows } = await supabase
        .from('email_queue')
        .select('*')
        .in('status', ['pending', 'retrying'])
        .lte('scheduled_at', nowIso)
        // Mirrors the RPC's predicate: a row still inside its backoff window is not
        // claimable, no matter what its status says.
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
        .order('priority', { ascending: true })
        .order('scheduled_at', { ascending: true })
        .limit(batchSize)

      // Claim row-by-row with a compare-and-swap on status, and increment
      // attempt_count the way the RPC does. The previous bulk update did neither: a
      // permanently failing item never advanced its attempt count, so it never reached
      // max_attempts and retried forever, burning a provider call every cycle.
      for (const row of (rawRows || []) as Array<Record<string, unknown>>) {
        const currentAttempts = Number(row.attempt_count || 0)
        const { data: claimedRow } = await supabase
          .from('email_queue')
          .update({
            status: 'processing',
            processing_at: nowIso,
            attempt_count: currentAttempts + 1,
            updated_at: nowIso,
          })
          .eq('id', String(row.id))
          .in('status', ['pending', 'retrying'])
          .select('*')
          .maybeSingle()

        // Only rows we actually won are ours to process; anything else was claimed
        // concurrently and must be left alone.
        if (claimedRow) claimedRows.push(claimedRow as Record<string, unknown>)
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

  // Admin-configured retry backoff. `retryDelayMinutes` is persisted by the Settings
  // workspace and previously had no runtime consumer — the backoff base was hardcoded.
  let retryDelayMinutes = DEFAULT_RETRY_DELAY_MINUTES
  try {
    const { SettingsService } = await import('@/lib/admin/settings-service')
    const emailSettings = await SettingsService.getEmailSettings()
    if (Number.isFinite(emailSettings.retryDelayMinutes) && emailSettings.retryDelayMinutes > 0) {
      retryDelayMinutes = emailSettings.retryDelayMinutes
    }
  } catch {
    // Settings unavailable — keep the documented default rather than wedging the queue.
  }

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

    // C2. Global Daily Send Quota — checked BEFORE dispatch, not after.
    // `increment_daily_email_quota` atomically increments-and-checks in one statement,
    // returning false once `dailyLimit` is reached for today (critical auth emails
    // bypass it, matching their suppression bypass above). This is the circuit
    // breaker that was missing during the 2026-09-06 signup-abuse incident: the
    // quota existed and was tracked, but was only ever incremented *after* a
    // successful send, so it never actually stopped anything. Once quota is
    // exhausted, every remaining non-critical item in this batch is deferred to
    // the next processing run rather than burning further calls against it.
    if (!isCritical) {
      let quotaAvailable = true
      try {
        const { data: hasQuota } = await supabase.rpc('increment_daily_email_quota', { p_limit: automationsState.dailyLimit })
        quotaAvailable = hasQuota !== false
      } catch (quotaErr) {
        console.warn('[processEmailQueue] Daily quota RPC check failed — proceeding without quota gate:', quotaErr)
      }

      if (!quotaAvailable) {
        const nextRetryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // retry in 1h
        await supabase.from('email_queue')
          .update({ status: 'retrying', next_retry_at: nextRetryAt, error_message: 'Daily email send quota reached', updated_at: new Date().toISOString() })
          .eq('id', queueId)
        skippedCount++
        continue
      }
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

    // E. Dispatch through the shared failover helper (primary provider, then the other
    // one exactly once if the primary could not accept the message). This path used to
    // resolve a single provider and re-try that same provider on every retry cycle, so
    // the second provider was never attempted — Brevo quota exhaustion stalled the
    // whole queue while a healthy Resend key sat idle.
    const sendResult = await sendEmailWithFailover(
      {
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
      },
      globalProviderRegistry
    )

    if (sendResult.success) {
      await supabase.from('email_queue')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          resend_id: sendResult.externalId || null,
          provider: sendResult.provider || null,
          provider_attempts: (serializeAttempts(sendResult.attempts) as unknown as import('@/lib/supabase').Json),
          updated_at: new Date().toISOString(),
        })
        .eq('id', queueId)

      deliveredCount++
    } else {
      await handleRetryableFailure(
        supabase,
        queueId,
        sendResult.error || 'Provider send failed',
        attemptCount,
        maxAttempts,
        {
          userId,
          templateKey,
          templateVariables,
          provider: sendResult.provider,
          attempts: sendResult.attempts,
          retryDelayMinutes,
        }
      )
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

/**
 * Context carried alongside a failure so the resulting queue row, dead-letter record
 * and system error can answer "which user, which template, which provider?".
 */
interface QueueFailureContext {
  userId: string
  templateKey: string
  templateVariables: Record<string, unknown>
  provider?: string
  attempts?: ProviderSendResult[]
  /** Admin-configured backoff base, in minutes. */
  retryDelayMinutes?: number
}

/** Flattens provider attempts into a JSON-serializable audit trail. */
function serializeAttempts(attempts?: ProviderSendResult[]): Array<Record<string, unknown>> {
  return (attempts || []).map((a) => ({
    provider: a.providerName,
    success: a.success,
    statusCode: a.statusCode ?? null,
    error: a.error ?? null,
    externalId: a.externalId ?? null,
    timestamp: a.timestamp,
  }))
}

async function handleRetryableFailure(
  supabase: ReturnType<typeof createServiceRoleClient>,
  queueId: string,
  errorMessage: string,
  attemptCount: number,
  maxAttempts: number,
  context: QueueFailureContext
): Promise<void> {
  const now = new Date()
  // Exponential backoff on the admin-configured base (default 5m -> 10m, 20m, 40m).
  const backoffBase = context.retryDelayMinutes && context.retryDelayMinutes > 0
    ? context.retryDelayMinutes
    : DEFAULT_RETRY_DELAY_MINUTES
  const nextRetryMinutes = Math.pow(2, attemptCount) * backoffBase
  const nextRetryAt = new Date(now.getTime() + nextRetryMinutes * 60 * 1000).toISOString()

  if (attemptCount >= maxAttempts) {
    // Previously this passed empty strings for user/template and an empty variables
    // object, so every dead-lettered email lost the identity of who it was for and
    // what it was — making it impossible to answer "which user was affected?" or to
    // re-render the message for a replay.
    await handlePermanentFailure(
      supabase,
      queueId,
      context.userId,
      context.templateKey,
      context.templateVariables,
      `Max retries (${maxAttempts}) exceeded. Last error: ${errorMessage}`,
      attemptCount,
      context
    )
  } else {
    await supabase.from('email_queue')
      .update({
        status: 'retrying',
        error_message: errorMessage,
        next_retry_at: nextRetryAt,
        failed_at: now.toISOString(),
        provider: context.provider || null,
        provider_attempts: (serializeAttempts(context.attempts) as unknown as import('@/lib/supabase').Json),
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
  attemptCount: number,
  context?: Pick<QueueFailureContext, 'provider' | 'attempts'>
): Promise<void> {
  const now = new Date().toISOString()
  const attempts = serializeAttempts(context?.attempts)

  await supabase.from('email_queue')
    .update({
      status: 'dead_letter',
      error_message: failureReason,
      failed_at: now,
      provider: context?.provider || null,
      provider_attempts: (attempts as unknown as import('@/lib/supabase').Json),
      updated_at: now,
    })
    .eq('id', queueId)

  try {
    const { logErrorReport } = await import('@/lib/monitoring/logger')
    void logErrorReport({
      domain: 'queue',
      kind: 'provider_rejected',
      operation: 'queue.dead_letter',
      // Stable: the specific failure text and ids live in subject/details so that a
      // burst of dead letters collapses into one incident with a count.
      summary: 'Queued email exhausted its retries and was dead-lettered',
      subject: { queueId, templateKey, userId },
      provider: context?.provider ? { name: context.provider } : undefined,
      retryability: 'manual_retry',
      nextAction:
        'Inspect the dead letter record, fix the underlying cause, then requeue it from the admin email queue.',
      details: { attemptCount, failureReason, attempts },
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
      // Record every provider attempt, not just a single synthesized entry, so a
      // dead letter says which providers were tried and how each one refused.
      all_errors: ([
        { attempt: attemptCount, error: failureReason, timestamp: now, provider: context?.provider ?? null },
        ...attempts,
      ] as unknown as import('@/lib/supabase').Json),
      created_at: now,
    })
  } catch {
    // Non-fatal dead letter insert fallback
  }
}
