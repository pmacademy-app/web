/**
 * Email Broadcast Service
 *
 * Manages persistent admin email broadcasts. Broadcasts are stored in
 * `email_broadcasts`, their recipient filters are frozen at creation, and
 * they are executed in controlled batches using the shared `user-filter-query.ts`
 * layer to guarantee that preview counts match actual send lists.
 */

import { createServiceRoleClient } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { applyUserFilters, countMatchingUsers, sampleMatchingUsers } from './user-filter-query'
import type { AdminUserFilters } from './types'

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type BroadcastStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled'

export interface BroadcastRecord {
  id: string
  name: string
  description: string | null
  template_key: string
  subject_override: string | null
  batch_size: number
  status: BroadcastStatus
  recipient_filters: AdminUserFilters
  scheduled_at: string | null
  started_at: string | null
  completed_at: string | null
  sent_count: number
  failed_count: number
  skipped_count: number
  total_recipients: number | null
  last_batch_index: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateBroadcastInput {
  name: string
  description?: string
  template_key: string
  subject_override?: string
  batch_size?: number
  recipient_filters?: AdminUserFilters
  created_by?: string
}

export interface UpdateBroadcastInput {
  name?: string
  description?: string
  template_key?: string
  subject_override?: string
  batch_size?: number
  recipient_filters?: AdminUserFilters
}

export interface BroadcastListResult {
  broadcasts: BroadcastRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface BatchExecuteResult {
  broadcastId: string
  batchIndex: number
  sent: number
  failed: number
  skipped: number
  isComplete: boolean
  totalSent: number
  totalFailed: number
  status: BroadcastStatus
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class BroadcastService {
  /**
   * Returns a paginated list of all broadcasts, newest first.
   */
  static async listBroadcasts(
    page = 1,
    pageSize = 25
  ): Promise<BroadcastListResult> {
    const supabase = createServiceRoleClient()
    const offset = (page - 1) * pageSize
    try {
      const { data, count, error } = await supabase
        .from('email_broadcasts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)

      if (error) throw error
      const total = count ?? 0
      return {
        broadcasts: (data || []) as unknown as BroadcastRecord[],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      }
    } catch (err) {
      console.error('[BroadcastService] listBroadcasts failed:', err)
      return { broadcasts: [], total: 0, page, pageSize, totalPages: 1 }
    }
  }

  /**
   * Returns a single broadcast record by ID.
   */
  static async getBroadcast(id: string): Promise<BroadcastRecord | null> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('email_broadcasts')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return data as unknown as BroadcastRecord | null
    } catch (err) {
      console.error('[BroadcastService] getBroadcast failed:', err)
      return null
    }
  }

  /**
   * Creates a new draft broadcast.
   */
  static async createBroadcast(input: CreateBroadcastInput): Promise<BroadcastRecord | null> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('email_broadcasts')
        .insert({
          name: input.name.trim(),
          description: input.description?.trim() || null,
          template_key: input.template_key,
          subject_override: input.subject_override?.trim() || null,
          batch_size: input.batch_size ?? 100,
          status: 'draft',
          recipient_filters: (input.recipient_filters ?? {}) as Json,
          created_by: input.created_by || null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data as unknown as BroadcastRecord
    } catch (err) {
      console.error('[BroadcastService] createBroadcast failed:', err)
      return null
    }
  }

  /**
   * Updates a broadcast. Only allowed when status is 'draft'.
   * Once sending begins, filters are immutable.
   */
  static async updateBroadcast(
    id: string,
    input: UpdateBroadcastInput,
    allowStatuses: BroadcastStatus[] = ['draft']
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (!allowStatuses.includes(existing.status)) {
        return {
          success: false,
          error: `Cannot update broadcast in '${existing.status}' state.`,
        }
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.description !== undefined) patch.description = input.description.trim() || null
      if (input.template_key !== undefined) patch.template_key = input.template_key
      if (input.subject_override !== undefined) patch.subject_override = input.subject_override.trim() || null
      if (input.batch_size !== undefined) patch.batch_size = input.batch_size
      if (input.recipient_filters !== undefined) patch.recipient_filters = input.recipient_filters as unknown as Json

      const { error } = await supabase.from('email_broadcasts').update(patch as never).eq('id', id)
      if (error) throw error
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed'
      return { success: false, error: msg }
    }
  }

  /**
   * Deletes a broadcast. Only allowed for drafts.
   */
  static async deleteBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (existing.status !== 'draft') {
        return { success: false, error: 'Only draft broadcasts can be deleted.' }
      }
      const { error } = await supabase.from('email_broadcasts').delete().eq('id', id)
      if (error) throw error
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed'
      return { success: false, error: msg }
    }
  }

  /**
   * Schedules a broadcast for future execution.
   */
  static async scheduleBroadcast(
    id: string,
    scheduledAt: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (!['draft', 'scheduled'].includes(existing.status)) {
        return { success: false, error: `Cannot schedule broadcast in '${existing.status}' state.` }
      }
      const { error } = await supabase
        .from('email_broadcasts')
        .update({ status: 'scheduled', scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Schedule failed'
      return { success: false, error: msg }
    }
  }

  /**
   * Cancels a scheduled, sending, or draft broadcast.
   */
  static async cancelBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (['completed', 'failed', 'cancelled'].includes(existing.status)) {
        return { success: false, error: `Cannot cancel broadcast in '${existing.status}' state.` }
      }
      const { error } = await supabase
        .from('email_broadcasts')
        .update({ status: 'cancelled', scheduled_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Cancel failed'
      return { success: false, error: msg }
    }
  }

  /**
   * Previews the recipient count for a given filter set.
   * Uses the same filtering logic as broadcast execution.
   */
  static async previewRecipientCount(filters: AdminUserFilters): Promise<number> {
    return countMatchingUsers(filters)
  }

  /**
   * Returns a sample of matching users for admin preview.
   */
  static async previewRecipientSample(
    filters: AdminUserFilters,
    limit = 50
  ) {
    return sampleMatchingUsers(filters, limit)
  }

  /**
   * Executes the next batch of a broadcast with database-level atomic batch claiming.
   *
   * 1. Atomically claims the next batch index via conditional update.
   * 2. Uses the shared filtering layer to fetch the claimed page of recipients.
   * 3. Pre-filters already-sent users for idempotency.
   * 4. Enqueues each recipient via `enqueueNotificationItem` with `broadcastId` tagging.
   * 5. Triggers email queue flush.
   * 6. Updates progress counters and transitions to 'completed' when all recipients are processed.
   */
  static async executeBroadcastBatch(broadcastId: string): Promise<BatchExecuteResult> {
    const supabase = createServiceRoleClient()

    const broadcast = await this.getBroadcast(broadcastId)
    if (!broadcast) {
      throw new Error(`Broadcast ${broadcastId} not found`)
    }
    if (['completed', 'failed', 'cancelled'].includes(broadcast.status)) {
      return {
        broadcastId,
        batchIndex: broadcast.last_batch_index,
        sent: 0,
        failed: 0,
        skipped: 0,
        isComplete: broadcast.status === 'completed',
        totalSent: broadcast.sent_count,
        totalFailed: broadcast.failed_count,
        status: broadcast.status,
      }
    }

    const currentBatchIndex = broadcast.last_batch_index
    const targetBatchIndex = currentBatchIndex + 1
    const batchSize = broadcast.batch_size
    const filters = broadcast.recipient_filters as AdminUserFilters

    // ATOMIC BATCH CLAIM: conditionally advance last_batch_index
    // If another concurrent worker already claimed currentBatchIndex, update returns null
    const { data: claimed, error: claimErr } = await supabase
      .from('email_broadcasts')
      .update({
        status: 'sending',
        last_batch_index: targetBatchIndex,
        started_at: broadcast.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId)
      .eq('last_batch_index', currentBatchIndex)
      .select('id, last_batch_index')
      .maybeSingle()

    if (claimErr || !claimed) {
      // Concurrency collision: another execution claimed this batch index
      const fresh = await this.getBroadcast(broadcastId)
      return {
        broadcastId,
        batchIndex: fresh?.last_batch_index ?? currentBatchIndex,
        sent: 0,
        failed: 0,
        skipped: 0,
        isComplete: fresh?.status === 'completed',
        totalSent: fresh?.sent_count ?? 0,
        totalFailed: fresh?.failed_count ?? 0,
        status: fresh?.status ?? 'sending',
      }
    }

    const { enqueueNotificationItem, processEmailQueue } = await import(
      '@/lib/notifications/queue/processor'
    )

    // Stable candidate audience: exclude already-sent recipients for this broadcast and take page 1 of remaining un-sent matching candidates
    const { userIds, total: remainingCount } = await applyUserFilters(
      { ...filters, excludeBroadcastId: broadcastId },
      {
        page: 1,
        pageSize: batchSize,
      }
    )

    // Calculate initial total recipients if not yet set
    let campaignTotal = broadcast.total_recipients
    if (campaignTotal === null || campaignTotal === undefined) {
      campaignTotal = await countMatchingUsers(filters)
    }

    // Mark broadcast as sending and set total if first batch
    if (broadcast.status !== 'sending' || broadcast.total_recipients === null) {
      await supabase
        .from('email_broadcasts')
        .update({
          status: 'sending',
          total_recipients: campaignTotal,
          started_at: broadcast.started_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', broadcastId)
    }

    // Fetch user details for this batch
    const { data: usersData } = await supabase
      .from('users')
      .select('id, email, name')
      .in('id', userIds)

    const users = (usersData || []) as Array<{ id: string; email: string; name: string | null }>

    // Check which users already received this broadcast (idempotency)
    const { data: alreadySentData } = await supabase
      .from('email_queue')
      .select('user_id')
      .eq('broadcast_id', broadcastId)
      .in('user_id', userIds)

    const alreadySentIds = new Set(
      ((alreadySentData || []) as Array<{ user_id: string }>).map((r) => r.user_id)
    )

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const user of users) {
      if (alreadySentIds.has(user.id)) {
        skipped++
        continue
      }

      const templateVars: Record<string, unknown> = {
        userName: user.name || user.email.split('@')[0] || 'Learner',
        appUrl: siteUrl,
        ...(broadcast.subject_override
          ? { subjectOverride: broadcast.subject_override }
          : {}),
      }

      const eventId = `broadcast-${broadcastId}-${user.id}`

      try {
        const enqueueRes = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || undefined,
          channel: 'email',
          templateKey: broadcast.template_key,
          templateVariables: templateVars,
          eventId,
          eventType: 'admin.broadcast',
          category: 'learning',
          priorityLevel: 'bulk',
          broadcastId, // stored in email_queue.broadcast_id for deduplication
        })

        if (enqueueRes.success) {
          sent++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    // Trigger queue processing for this batch
    try {
      await processEmailQueue(batchSize)
    } catch (err) {
      console.warn('[BroadcastService] processEmailQueue error (non-fatal):', err)
    }

    const newBatchIndex = targetBatchIndex
    const isComplete = userIds.length === 0 || remainingCount <= userIds.length

    const newStatus: BroadcastStatus = isComplete ? 'completed' : 'sending'
    const totalSent = broadcast.sent_count + sent
    const totalFailed = broadcast.failed_count + failed

    await supabase
      .from('email_broadcasts')
      .update({
        status: newStatus,
        sent_count: totalSent,
        failed_count: totalFailed,
        skipped_count: broadcast.skipped_count + skipped,
        last_batch_index: newBatchIndex,
        total_recipients: campaignTotal,
        completed_at: isComplete ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId)

    return {
      broadcastId,
      batchIndex: newBatchIndex,
      sent,
      failed,
      skipped,
      isComplete,
      totalSent,
      totalFailed,
      status: newStatus,
    }
  }

  /**
   * Processes all scheduled broadcasts whose scheduled_at has passed.
   * Called by the cron endpoint.
   */
  static async processScheduledBroadcasts(): Promise<{ processed: number; errors: number }> {
    const supabase = createServiceRoleClient()
    let processed = 0
    let errors = 0
    try {
      const { data: due } = await supabase
        .from('email_broadcasts')
        .select('id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', new Date().toISOString())

      for (const b of (due || []) as Array<{ id: string }>) {
        try {
          await this.executeBroadcastBatch(b.id)
          processed++
        } catch (err) {
          console.error(`[BroadcastService] Failed to execute scheduled broadcast ${b.id}:`, err)
          errors++
          // Mark as failed to prevent infinite retries
          await supabase
            .from('email_broadcasts')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('id', b.id)
        }
      }
    } catch (err) {
      console.error('[BroadcastService] processScheduledBroadcasts failed:', err)
    }
    return { processed, errors }
  }
}
