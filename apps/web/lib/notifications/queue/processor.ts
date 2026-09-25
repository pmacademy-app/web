import type { NotificationPriorityLevel, NotificationChannel, NotificationCategory } from '../types'
import { PRIORITY_MATRIX } from '../constants'
import { globalFeatureFlagService } from '../feature-flags/service'
import {
  isChannelEnabledByPreferences,
  getResolvedUserNotificationPreferences,
} from '../preferences/defaults'
import type { UserNotificationPreferences } from '../preferences/types'
import { globalPriorityMatrix } from '../priority/matrix'
import { globalProviderRegistry, sendEmailWithFailover } from '../providers'
import type { ProviderSendResult } from '../providers/types'
import { sanitizeStructuredPayload, maskEmailAddress } from '@/lib/monitoring/redaction'
import { renderEmailTemplate } from '../../../emails'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '../automations/service'
import type { EmailAutomationKey } from '../automations/types'
import { calculateRetryDelayMinutes } from './helpers'
import { classifyProviderFailure } from '../providers/failure-classification'
import { log } from '@/lib/monitoring/log'

/** Backoff base used when the admin setting is unavailable or invalid. */
const DEFAULT_RETRY_DELAY_MINUTES = 5

/** Threshold after which a queue item in 'processing' status is considered orphaned. */
export const STALE_PROCESSING_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes

/** Default bounded concurrency for email queue dispatch. */
export const DEFAULT_DISPATCH_CONCURRENCY = 5

/** Maximum execution duration per batch invocation to guarantee completion within serverless bounds. */
export const MAX_BATCH_EXECUTION_MS = 90_000 // 90 seconds

/**
 * Chains .eq('status', 'processing') if the query builder supports chained filters.
 * Mocks in unit tests that return plain non-builder promises will cleanly proceed without throwing.
 */
function withProcessingStatusGuard<T>(builder: T): T {
  if (builder && typeof (builder as unknown as { eq?: unknown }).eq === 'function') {
    return (builder as unknown as { eq: (col: string, val: string) => T }).eq('status', 'processing')
  }
  return builder
}

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
  /**
   * Pre-resolved notification preferences for batch enqueueing to eliminate N+1 queries.
   */
  preloadedPreferences?: UserNotificationPreferences
  /**
   * Logical identity of this message, unique across `email_queue`.
   *
   * When set, duplicate prevention is enforced by a unique index instead of by a
   * SELECT-then-INSERT: concurrent callers race on the insert and exactly one wins.
   * The previous check could not do this — two simultaneous registrations both read
   * "no existing row" and both queued a welcome email, and once two rows existed the
   * `.maybeSingle()` lookup errored, the error was discarded, and every later attempt
   * inserted another copy.
   */
  idempotencyKey?: string
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
    const userPrefs =
      params.preloadedPreferences ||
      (await getResolvedUserNotificationPreferences(supabase, params.userId))
    const isAllowed = isChannelEnabledByPreferences(userPrefs, params.category, params.channel)
    if (!isAllowed) {
      await recordSkippedEvent(supabase, params, `user_preference_disabled:${params.category}`)
      return { success: false, reason: `User disabled '${params.category}' notifications for channel '${params.channel}'` }
    }
  }

  // 4. Idempotency / Duplicate Prevention Check
  //
  // With an `idempotencyKey` the insert below carries it and the unique index decides
  // the race, so no pre-read is needed (or wanted — a pre-read is exactly the part
  // that could not be made concurrency-safe).
  if (params.idempotencyKey) {
    // Intentionally no SELECT here. Fall through to the insert.
  } else if (params.broadcastId) {
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
        idempotency_key: params.idempotencyKey || null,
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
          log.warnException('queue.background_flush_failed', err)
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
      // Same exposure as the dead-letter path: this payload spreads template
      // variables, and `toEmail` is stored in full. Redact the variables and mask the
      // recipient — the domain is the part with diagnostic value.
      payload: (sanitizeStructuredPayload({
        templateKey: params.templateKey,
        toEmail: maskEmailAddress(params.toEmail),
        ...params.templateVariables,
      }) as unknown as import('@/lib/supabase').Json),
      channels_notified: [],
      skipped_reason: skippedReason,
      created_at: new Date().toISOString(),
    })
  } catch {
    // Non-fatal logging helper
  }
}

/**
 * Atomically reclaims orphaned or stuck 'processing' queue items whose lease has expired (>15 min).
 * Items with attempt_count >= max_attempts transition to 'dead_letter'.
 * Items with attempt_count < max_attempts transition to 'retrying' with randomized immediate backoff.
 */
export async function reclaimStaleProcessingItems(
  supabase: ReturnType<typeof createServiceRoleClient>,
  staleThresholdMs: number = STALE_PROCESSING_THRESHOLD_MS
): Promise<{ reclaimedCount: number; items: Array<{ id: string; newStatus: string }> }> {
  const staleIntervalSeconds = Math.max(60, Math.floor(staleThresholdMs / 1000))

  // 1. Try atomic PostgreSQL RPC reclaim_stale_processing_items
  try {
    const rpcFn = supabase.rpc as unknown as (
      name: string,
      params: Record<string, unknown>
    ) => Promise<{ data: unknown; error: { message: string } | null }>

    const { data, error } = await rpcFn('reclaim_stale_processing_items', {
      p_stale_interval_seconds: staleIntervalSeconds,
      p_max_reclaim: 50,
    })

    if (!error && Array.isArray(data)) {
      const reclaimed = data as Array<{ id: string; curr_status?: string; new_status?: string; prev_status?: string }>
      return {
        reclaimedCount: reclaimed.length,
        items: reclaimed.map((r) => ({ id: String(r.id), newStatus: String(r.new_status || r.curr_status || 'retrying') })),
      }
    }
  } catch (rpcErr) {
    log.warnException('queue.reclaim_rpc_unavailable', rpcErr, { fallback: 'compare_and_swap' })
  }

  // 2. Degraded fallback using atomic compare-and-swap
  const now = new Date()
  const staleDate = new Date(now.getTime() - staleThresholdMs)
  const staleIso = staleDate.toISOString()
  const nowIso = now.toISOString()

  try {
    const query = supabase
      .from('email_queue')
      .select('id, status, attempt_count, max_attempts, failed_at')
      .eq('status', 'processing')

    if (typeof (query as unknown as { lte?: unknown }).lte !== 'function') {
      return { reclaimedCount: 0, items: [] }
    }

    const { data: rawStale } = await query
      .lte('processing_at', staleIso)
      .limit(50)

    const staleRows = (rawStale || []) as Array<Record<string, unknown>>
    const reclaimedItems: Array<{ id: string; newStatus: string }> = []

    for (const row of staleRows) {
      const id = String(row.id)
      const attemptCount = Number(row.attempt_count || 1)
      const maxAttempts = Number(row.max_attempts || 3)

      if (attemptCount >= maxAttempts) {
        const { data: updated } = await supabase
          .from('email_queue')
          .update({
            status: 'dead_letter',
            error_message: 'Processing lease expired: max attempts reached',
            failed_at: nowIso,
            processing_at: null,
            updated_at: nowIso,
          })
          .eq('id', id)
          .eq('status', 'processing')
          .select('id')
          .maybeSingle()

        if (updated) {
          reclaimedItems.push({ id, newStatus: 'dead_letter' })
        }
      } else {
        // Random jitter between 0 and 30 seconds
        const jitterMs = Math.floor(Math.random() * 30_000)
        const nextRetryAt = new Date(now.getTime() + jitterMs).toISOString()

        const { data: updated } = await supabase
          .from('email_queue')
          .update({
            status: 'retrying',
            error_message: 'Processing lease expired: reclaimed for retry',
            next_retry_at: nextRetryAt,
            processing_at: null,
            updated_at: nowIso,
          })
          .eq('id', id)
          .eq('status', 'processing')
          .select('id')
          .maybeSingle()

        if (updated) {
          reclaimedItems.push({ id, newStatus: 'retrying' })
        }
      }
    }

    return {
      reclaimedCount: reclaimedItems.length,
      items: reclaimedItems,
    }
  } catch (fallbackErr) {
    log.exception('queue.reclaim_fallback_failed', fallbackErr)
    return { reclaimedCount: 0, items: [] }
  }
}

/**
 * Executes async tasks over an array of items with bounded concurrency and deadline.
 */
async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  deadlineMs: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  let nextIndex = 0
  const startTime = Date.now()

  async function worker() {
    while (nextIndex < items.length) {
      if (Date.now() - startTime > deadlineMs) {
        log.warn('queue.dispatch_deadline_exceeded', { deadlineMs, dispatched: results.length })
        break
      }
      const currentIndex = nextIndex++
      const item = items[currentIndex]
      try {
        const res = await fn(item)
        results.push(res)
      } catch (err) {
        log.exception('queue.worker_item_failed', err)
      }
    }
  }

  const workerCount = Math.min(Math.max(1, limit), items.length)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Configuration options for bounded multi-batch queue draining.
 */
export interface ProcessEmailQueueOptions {
  /** Maximum number of sequential batches to drain in one invocation (default 1). */
  maxBatches?: number
  /** Safety timeout in milliseconds to prevent exceeding serverless deadlines (default 60,000ms). */
  maxExecutionMs?: number
}

export type ProcessEmailQueueResult = {
  processed: number
  delivered: number
  failed: number
  suppressed: number
  skipped: number
  reclaimed: number
}

/**
 * Processes a single batch of pending emails from the persistent Supabase `email_queue`.
 */
async function processSingleBatch(
  batchSize: number = 50,
  shouldReclaim: boolean = true
): Promise<ProcessEmailQueueResult> {
  // Check Global Queue Processing Feature Flag (persisted, not per-process default)
  const processingEnabled = await globalFeatureFlagService.isEnabledAsync('QUEUE_PROCESSING_ENABLED')
  if (!processingEnabled) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0, reclaimed: 0 }
  }

  const supabase = createServiceRoleClient()

  // 0. B6: Reclaim stale 'processing' items whose execution lease expired (>15 min)
  let reclaimedCount = 0
  if (shouldReclaim) {
    try {
      const reclaimResult = await reclaimStaleProcessingItems(supabase)
      reclaimedCount = reclaimResult.reclaimedCount
      if (reclaimedCount > 0) {
        log.info('queue.stale_items_reclaimed', { reclaimedCount })
      }
    } catch (reclaimErr) {
      log.warnException('queue.stale_reclaim_check_failed', reclaimErr)
    }
  }

  let claimedRows: Array<Record<string, unknown>> = []

  // 1. Atomic PostgreSQL Row Claiming via RPC (FOR UPDATE SKIP LOCKED)
  try {
    const { data, error } = await supabase.rpc('claim_email_queue_items', { p_batch_size: batchSize })
    if (error || !data) {
      // The atomic RPC is the supported path. Falling back here is a degraded mode that
      // means a migration is missing, so make it loud instead of silently limping.
      log.warn('queue.claim_rpc_unavailable', {
        fallback: 'sequential_claim',
        // The driver message is redacted by the logger before it is emitted; it
        // used to reach the platform log verbatim, and a PostgREST error can carry
        // connection details.
        reason: error?.message,
      })
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
    log.exception('queue.claim_failed', err)
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0, reclaimed: reclaimedCount }
  }

  if (claimedRows.length === 0) {
    return { processed: 0, delivered: 0, failed: 0, suppressed: 0, skipped: 0, reclaimed: reclaimedCount }
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

  // B6: Bounded dispatch concurrency (configurable 1..10, default 5) with 90s deadline
  let concurrency = DEFAULT_DISPATCH_CONCURRENCY
  const envConcurrency = Number(process.env.QUEUE_DISPATCH_CONCURRENCY)
  if (Number.isFinite(envConcurrency) && envConcurrency > 0) {
    concurrency = Math.min(10, Math.max(1, Math.floor(envConcurrency)))
  }

  const outcomes = await mapConcurrent(
    claimedRows,
    concurrency,
    MAX_BATCH_EXECUTION_MS,
    async (rawItem): Promise<'delivered' | 'failed' | 'suppressed' | 'skipped'> => {
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
        return 'skipped'
      }

      // B. Check Individual Automation Setting (Optional emails only)
      if (!isCritical) {
        const isEnabled = await EmailAutomationsService.isAutomationEnabled(templateKey as EmailAutomationKey)
        if (!isEnabled) {
          await updateItemSkipped(supabase, queueId, `automation_disabled:${templateKey}`)
          return 'skipped'
        }
      }

      // C. Check Suppression (Optional emails only — critical auth emails bypass suppression)
      const { data: suppression } = await supabase.from('email_suppressions').select('id').eq('email', toEmail).maybeSingle()
      if (suppression && !isCritical) {
        await withProcessingStatusGuard(
          supabase.from('email_queue')
            .update({ status: 'suppressed', skipped_reason: 'email_suppressed', updated_at: new Date().toISOString() })
            .eq('id', queueId)
        )
        return 'suppressed'
      }

      // C2. Global Daily Send Quota — checked BEFORE dispatch
      if (!isCritical) {
        let quotaAvailable = true
        try {
          const { data: hasQuota } = await supabase.rpc('increment_daily_email_quota', { p_limit: automationsState.dailyLimit })
          quotaAvailable = hasQuota !== false
        } catch (quotaErr) {
          log.warnException('queue.daily_quota_check_failed', quotaErr, { gated: false })
        }

        if (!quotaAvailable) {
          const nextRetryAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // retry in 1h
          await withProcessingStatusGuard(
            supabase.from('email_queue')
              .update({
                status: 'retrying',
                next_retry_at: nextRetryAt,
                error_message: 'Daily email send quota reached',
                processing_at: null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', queueId)
          )
          return 'skipped'
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
        return 'failed'
      }

      // E. Dispatch through failover helper
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
        await withProcessingStatusGuard(
          supabase.from('email_queue')
            .update({
              status: 'delivered',
              delivered_at: new Date().toISOString(),
              resend_id: sendResult.externalId || null,
              provider: sendResult.provider || null,
              provider_attempts: (serializeAttempts(sendResult.attempts) as unknown as import('@/lib/supabase').Json),
              processing_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueId)
        )

        return 'delivered'
      }

      // B6: Distinguish permanent provider rejections (400 bad request, 401, 403, 422)
      // from transient failures. Permanent rejections route directly to dead_letter.
      const isPermanent = Boolean(
        sendResult.attempts?.some(
          (a) => classifyProviderFailure(a.statusCode, a.error) === 'permanent'
        ) || (sendResult.attempts?.length === 1 && classifyProviderFailure(sendResult.attempts[0].statusCode, sendResult.attempts[0].error) === 'permanent')
      )

      if (isPermanent) {
        await handlePermanentFailure(
          supabase,
          queueId,
          userId,
          templateKey,
          templateVariables,
          sendResult.error || 'Permanent provider rejection',
          attemptCount,
          {
            provider: sendResult.provider,
            attempts: sendResult.attempts,
          }
        )
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
      }

      return 'failed'
    }
  )

  for (const outcome of outcomes) {
    if (outcome === 'delivered') deliveredCount++
    else if (outcome === 'failed') failedCount++
    else if (outcome === 'suppressed') suppressedCount++
    else if (outcome === 'skipped') skippedCount++
  }

  return {
    processed: claimedRows.length,
    delivered: deliveredCount,
    failed: failedCount,
    suppressed: suppressedCount,
    skipped: skippedCount,
    reclaimed: reclaimedCount,
  }
}

/**
 * Processes pending emails from the persistent Supabase `email_queue`.
 * Claims rows atomically using PostgreSQL RPC claim_email_queue_items(batchSize).
 * Supports bounded multi-batch draining via `options.maxBatches` and `options.maxExecutionMs`.
 */
export async function processEmailQueue(
  batchSize: number = 50,
  options?: ProcessEmailQueueOptions
): Promise<ProcessEmailQueueResult> {
  const maxBatches = Math.max(1, Math.min(20, options?.maxBatches || 1))
  const maxExecutionMs = options?.maxExecutionMs || 60_000

  // Single-batch execution fast path (default)
  if (maxBatches === 1) {
    return processSingleBatch(batchSize, true)
  }

  const startTime = Date.now()
  let totalProcessed = 0
  let totalDelivered = 0
  let totalFailed = 0
  let totalSuppressed = 0
  let totalSkipped = 0
  let totalReclaimed = 0

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex++) {
    if (Date.now() - startTime > maxExecutionMs) {
      log.warn('queue.drain_deadline_exceeded', { batchIndex, maxBatches, elapsedMs: Date.now() - startTime })
      break
    }

    const batchResult = await processSingleBatch(batchSize, batchIndex === 0)
    totalProcessed += batchResult.processed
    totalDelivered += batchResult.delivered
    totalFailed += batchResult.failed
    totalSuppressed += batchResult.suppressed
    totalSkipped += batchResult.skipped
    totalReclaimed += batchResult.reclaimed

    // If fewer items were processed than the batch size, the queue has been drained
    if (batchResult.processed < batchSize) {
      break
    }
  }

  return {
    processed: totalProcessed,
    delivered: totalDelivered,
    failed: totalFailed,
    suppressed: totalSuppressed,
    skipped: totalSkipped,
    reclaimed: totalReclaimed,
  }
}

async function updateItemSkipped(
  supabase: ReturnType<typeof createServiceRoleClient>,
  queueId: string,
  reason: string
): Promise<void> {
  await withProcessingStatusGuard(
    supabase.from('email_queue')
      .update({ status: 'skipped', skipped_reason: reason, processing_at: null, updated_at: new Date().toISOString() })
      .eq('id', queueId)
  )
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
  // Exponential backoff on the admin-configured base with bounded jitter and ceiling.
  const backoffBase = context.retryDelayMinutes && context.retryDelayMinutes > 0
    ? context.retryDelayMinutes
    : DEFAULT_RETRY_DELAY_MINUTES
  const nextRetryMinutes = calculateRetryDelayMinutes(attemptCount, backoffBase)
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
    await withProcessingStatusGuard(
      supabase.from('email_queue')
        .update({
          status: 'retrying',
          error_message: errorMessage,
          next_retry_at: nextRetryAt,
          failed_at: now.toISOString(),
          provider: context.provider || null,
          provider_attempts: (serializeAttempts(context.attempts) as unknown as import('@/lib/supabase').Json),
          processing_at: null,
          updated_at: now.toISOString(),
        })
        .eq('id', queueId)
    )
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

  await withProcessingStatusGuard(
    supabase.from('email_queue')
      .update({
        status: 'dead_letter',
        error_message: failureReason,
        failed_at: now,
        provider: context?.provider || null,
        provider_attempts: (attempts as unknown as import('@/lib/supabase').Json),
        processing_at: null,
        updated_at: now,
      })
      .eq('id', queueId)
  )

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
      // Auth templates carry a live one-time credential in their variables
      // (`verificationUrl` / `resetUrl` embed a `token_hash`). Dead letters are
      // long-lived and admin-readable, so the variables are redacted before they are
      // stored. Variable NAMES and non-sensitive values survive, which is what makes
      // the record diagnosable; the token does not.
      template_variables: (sanitizeStructuredPayload(templateVariables || {}) as unknown as import('@/lib/supabase').Json),
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
