/**
 * In-App Notification Manager Service
 *
 * Manages admin-initiated in-app notification campaigns and broadcasts.
 * Integrates with the unified server-side user filtering engine (`user-filter-query.ts`)
 * for targeting, recipient preview, and execution, and persists learner rows in `in_app_notifications`.
 */

import { createServiceRoleClient } from '@/lib/supabase'
import { createInAppNotification } from '@/lib/notifications/in-app/service'
import { queryUserIds } from './user-filter-query'
import type { AdminUserFilters } from './types'
import type { NotificationPriorityLevel } from '@/lib/notifications/types'

/* ─── Types ──────────────────────────────────────────────────────────────── */

export type InAppBroadcastStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'failed'

export type InAppAudienceType = 'all' | 'individual' | 'cohort' | 'filtered'
export type InAppPriorityLevel = 'low' | 'medium' | 'high' | 'urgent'
export type InAppCategory =
  | 'announcement'
  | 'learning'
  | 'achievements'
  | 'product_updates'
  | 'security'
  | 'marketing'

export interface InAppBroadcastItem {
  id: string
  title: string
  body: string
  category: string
  priority: InAppPriorityLevel
  priorityNumber: number
  actionUrl: string | null
  audience: InAppAudienceType
  targetUserId: string | null
  targetCohortId: string | null
  recipientFilters: AdminUserFilters
  status: InAppBroadcastStatus
  scheduledAt: string | null
  sentAt: string | null
  expiresAt: string | null
  totalTargeted: number
  totalDelivered: number
  totalRead: number
  readRate: number
  createdBy: string | null
  idempotencyKey: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateInAppBroadcastInput {
  title: string
  body: string
  category?: InAppCategory | string
  priority?: InAppPriorityLevel
  actionUrl?: string | null
  audience?: InAppAudienceType
  targetUserId?: string | null
  targetCohortId?: string | null
  recipientFilters?: AdminUserFilters
  scheduledAt?: string | null
  expiresAt?: string | null
  status?: InAppBroadcastStatus
  createdBy?: string | null
  idempotencyKey?: string | null
}

export interface UpdateInAppBroadcastInput {
  title?: string
  body?: string
  category?: InAppCategory | string
  priority?: InAppPriorityLevel
  actionUrl?: string | null
  audience?: InAppAudienceType
  targetUserId?: string | null
  targetCohortId?: string | null
  recipientFilters?: AdminUserFilters
  scheduledAt?: string | null
  expiresAt?: string | null
}

export interface InAppBroadcastListResult {
  broadcasts: InAppBroadcastItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  metrics: {
    totalCreated: number
    totalDelivered: number
    totalRead: number
    averageReadRate: number
    scheduledCount: number
    draftCount: number
  }
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

export function mapPriorityLevelToNumber(level: InAppPriorityLevel): number {
  switch (level) {
    case 'urgent':
      return 1
    case 'high':
      return 2
    case 'medium':
      return 5
    case 'low':
      return 8
    default:
      return 5
  }
}

export function mapNumberToPriorityLevel(num: number): InAppPriorityLevel {
  if (num <= 1) return 'urgent'
  if (num <= 2) return 'high'
  if (num <= 5) return 'medium'
  return 'low'
}

function mapPriorityToMatrixKey(level: InAppPriorityLevel): NotificationPriorityLevel {
  switch (level) {
    case 'urgent':
      return 'critical'
    case 'high':
      return 'high'
    case 'medium':
      return 'medium'
    case 'low':
      return 'low'
    default:
      return 'medium'
  }
}

function mapRowToItem(r: Record<string, unknown>): InAppBroadcastItem {
  const priorityNum = Number(r.priority) || 5
  const delivered = Number(r.total_delivered) || 0
  const read = Number(r.total_read) || 0
  const rate = delivered > 0 ? Math.round((read / delivered) * 100) : 0

  return {
    id: String(r.id),
    title: String(r.title || ''),
    body: String(r.body || ''),
    category: String(r.category || 'announcement'),
    priority: mapNumberToPriorityLevel(priorityNum),
    priorityNumber: priorityNum,
    actionUrl: r.action_url ? String(r.action_url) : null,
    audience: (r.audience as InAppAudienceType) || 'all',
    targetUserId: r.target_user_id ? String(r.target_user_id) : null,
    targetCohortId: r.target_cohort_id ? String(r.target_cohort_id) : null,
    recipientFilters: (r.recipient_filters as AdminUserFilters) || {},
    status: (r.status as InAppBroadcastStatus) || 'draft',
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    sentAt: r.sent_at ? String(r.sent_at) : null,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    totalTargeted: Number(r.total_targeted) || 0,
    totalDelivered: delivered,
    totalRead: read,
    readRate: rate,
    createdBy: r.created_by ? String(r.created_by) : null,
    idempotencyKey: r.idempotency_key ? String(r.idempotency_key) : null,
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString()),
  }
}

/* ─── Service ────────────────────────────────────────────────────────────── */

export class InAppManagerService {
  /**
   * Returns a paginated list of all in-app notifications/broadcasts with metrics.
   */
  static async listBroadcasts(
    page = 1,
    pageSize = 25,
    status?: string,
    search?: string
  ): Promise<InAppBroadcastListResult> {
    const supabase = createServiceRoleClient()
    const offset = (page - 1) * pageSize

    try {
      let q = supabase
        .from('in_app_broadcasts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (status && status !== 'all') {
        q = q.eq('status', status)
      }

      if (search && search.trim()) {
        q = q.or(`title.ilike.%${search.trim()}%,body.ilike.%${search.trim()}%`)
      }

      const { data, count, error } = await q.range(offset, offset + pageSize - 1)
      if (error) throw error

      const total = count ?? 0
      const items = (data || []).map((r) => mapRowToItem(r as unknown as Record<string, unknown>))

      // Recalculate read counts dynamically for completed broadcasts
      for (const item of items) {
        if (item.status === 'completed' && item.totalDelivered > 0) {
          try {
            const { count: readCount } = await supabase
              .from('in_app_notifications')
              .select('id', { count: 'exact', head: true })
              .like('idempotency_key', `inapp-${item.id}-%`)
              .eq('is_read', true)

            if (typeof readCount === 'number' && readCount !== item.totalRead) {
              item.totalRead = readCount
              item.readRate = item.totalDelivered > 0 ? Math.round((readCount / item.totalDelivered) * 100) : 0
              // Asynchronously update in_app_broadcasts record
              void supabase
                .from('in_app_broadcasts')
                .update({ total_read: readCount, updated_at: new Date().toISOString() })
                .eq('id', item.id)
            }
          } catch {
            // Keep existing totalRead
          }
        }
      }

      const metrics = await this.getSummaryMetrics()

      return {
        broadcasts: items,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        metrics,
      }
    } catch (err) {
      console.error('[InAppManagerService.listBroadcasts] Error:', err)
      return {
        broadcasts: [],
        total: 0,
        page,
        pageSize,
        totalPages: 1,
        metrics: {
          totalCreated: 0,
          totalDelivered: 0,
          totalRead: 0,
          averageReadRate: 0,
          scheduledCount: 0,
          draftCount: 0,
        },
      }
    }
  }

  /**
   * Computes aggregated summary KPIs across all in-app broadcasts.
   */
  static async getSummaryMetrics(): Promise<{
    totalCreated: number
    totalDelivered: number
    totalRead: number
    averageReadRate: number
    scheduledCount: number
    draftCount: number
  }> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('in_app_broadcasts')
        .select('status, total_delivered, total_read')

      if (error || !data) {
        return {
          totalCreated: 0,
          totalDelivered: 0,
          totalRead: 0,
          averageReadRate: 0,
          scheduledCount: 0,
          draftCount: 0,
        }
      }

      let totalDelivered = 0
      let totalRead = 0
      let scheduledCount = 0
      let draftCount = 0

      for (const row of data) {
        if (row.status === 'scheduled') scheduledCount++
        if (row.status === 'draft') draftCount++
        totalDelivered += Number(row.total_delivered) || 0
        totalRead += Number(row.total_read) || 0
      }

      const averageReadRate =
        totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0

      return {
        totalCreated: data.length,
        totalDelivered,
        totalRead,
        averageReadRate,
        scheduledCount,
        draftCount,
      }
    } catch {
      return {
        totalCreated: 0,
        totalDelivered: 0,
        totalRead: 0,
        averageReadRate: 0,
        scheduledCount: 0,
        draftCount: 0,
      }
    }
  }

  /**
   * Fetches a single in-app broadcast by ID.
   */
  static async getBroadcast(id: string): Promise<InAppBroadcastItem | null> {
    const supabase = createServiceRoleClient()
    try {
      const { data, error } = await supabase
        .from('in_app_broadcasts')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !data) return null
      return mapRowToItem(data as unknown as Record<string, unknown>)
    } catch {
      return null
    }
  }

  /**
   * Creates a new in-app notification campaign (Draft, Scheduled, or Immediate).
   */
  static async createBroadcast(input: CreateInAppBroadcastInput): Promise<InAppBroadcastItem> {
    const supabase = createServiceRoleClient()
    const priority = input.priority || 'medium'
    const priorityNum = mapPriorityLevelToNumber(priority)
    const idempotencyKey =
      input.idempotencyKey || `inapp-bcast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const status = input.status || (input.scheduledAt ? 'scheduled' : 'draft')

    const payload = {
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category || 'announcement',
      priority: priorityNum,
      action_url: input.actionUrl?.trim() || null,
      audience: input.audience || 'all',
      target_user_id: input.audience === 'individual' ? input.targetUserId || null : null,
      target_cohort_id: input.audience === 'cohort' ? input.targetCohortId || null : null,
      recipient_filters: input.recipientFilters || {},
      status,
      scheduled_at: input.scheduledAt || null,
      expires_at: input.expiresAt || null,
      total_targeted: 0,
      total_delivered: 0,
      total_read: 0,
      created_by: input.createdBy || null,
      idempotency_key: idempotencyKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('in_app_broadcasts')
      .insert(payload as never)
      .select()
      .single()

    if (error || !data) {
      throw new Error(error?.message || 'Failed to create in-app broadcast')
    }

    const item = mapRowToItem(data as unknown as Record<string, unknown>)

    // If status is immediate execution requested, trigger dispatch right away
    if (input.status === 'completed' || (!input.scheduledAt && input.status === 'sending')) {
      await this.executeBroadcast(item.id)
      const updated = await this.getBroadcast(item.id)
      return updated || item
    }

    return item
  }

  /**
   * Updates an existing draft or scheduled in-app notification.
   */
  static async updateBroadcast(
    id: string,
    input: UpdateInAppBroadcastInput
  ): Promise<InAppBroadcastItem> {
    const supabase = createServiceRoleClient()
    const existing = await this.getBroadcast(id)
    if (!existing) throw new Error('In-app broadcast not found.')

    if (!['draft', 'scheduled', 'paused'].includes(existing.status)) {
      throw new Error(`Cannot modify broadcast in '${existing.status}' status.`)
    }

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (input.title !== undefined) updatePayload.title = input.title.trim()
    if (input.body !== undefined) updatePayload.body = input.body.trim()
    if (input.category !== undefined) updatePayload.category = input.category
    if (input.priority !== undefined) {
      updatePayload.priority = mapPriorityLevelToNumber(input.priority)
    }
    if (input.actionUrl !== undefined) updatePayload.action_url = input.actionUrl?.trim() || null
    if (input.audience !== undefined) updatePayload.audience = input.audience
    if (input.targetUserId !== undefined) updatePayload.target_user_id = input.targetUserId
    if (input.targetCohortId !== undefined) updatePayload.target_cohort_id = input.targetCohortId
    if (input.recipientFilters !== undefined) updatePayload.recipient_filters = input.recipientFilters
    if (input.scheduledAt !== undefined) {
      updatePayload.scheduled_at = input.scheduledAt
      if (input.scheduledAt && existing.status === 'draft') {
        updatePayload.status = 'scheduled'
      }
    }
    if (input.expiresAt !== undefined) updatePayload.expires_at = input.expiresAt

    const { data, error } = await supabase
      .from('in_app_broadcasts')
      .update(updatePayload as never)
      .eq('id', id)
      .select()
      .single()

    if (error || !data) {
      throw new Error(error?.message || 'Failed to update in-app broadcast')
    }

    return mapRowToItem(data as unknown as Record<string, unknown>)
  }

  /**
   * Deletes a draft or cancelled in-app broadcast.
   */
  static async deleteBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (!['draft', 'cancelled'].includes(existing.status)) {
        return { success: false, error: 'Only draft or cancelled broadcasts can be deleted.' }
      }

      const { error } = await supabase.from('in_app_broadcasts').delete().eq('id', id)
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Delete failed' }
    }
  }

  /**
   * Schedules an in-app notification for future dispatch.
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
        return { success: false, error: `Cannot schedule broadcast in '${existing.status}' status.` }
      }

      const { error } = await supabase
        .from('in_app_broadcasts')
        .update({ status: 'scheduled', scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Schedule failed' }
    }
  }

  /**
   * Cancels a scheduled or paused in-app notification.
   */
  static async cancelBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (!['scheduled', 'draft', 'paused'].includes(existing.status)) {
        return { success: false, error: `Cannot cancel broadcast in '${existing.status}' status.` }
      }

      const { error } = await supabase
        .from('in_app_broadcasts')
        .update({ status: 'cancelled', scheduled_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Cancellation failed' }
    }
  }

  /**
   * Pauses a scheduled in-app notification.
   */
  static async pauseBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (existing.status !== 'scheduled') {
        return { success: false, error: 'Only scheduled broadcasts can be paused.' }
      }

      const { error } = await supabase
        .from('in_app_broadcasts')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Pause failed' }
    }
  }

  /**
   * Resumes a paused in-app notification back to scheduled state.
   */
  static async resumeBroadcast(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    try {
      const existing = await this.getBroadcast(id)
      if (!existing) return { success: false, error: 'Broadcast not found.' }
      if (existing.status !== 'paused') {
        return { success: false, error: 'Only paused broadcasts can be resumed.' }
      }

      const { error } = await supabase
        .from('in_app_broadcasts')
        .update({ status: 'scheduled', updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Resume failed' }
    }
  }

  /**
   * Resolves target recipient user IDs for an in-app broadcast based on audience selection.
   */
  static async resolveRecipients(broadcast: InAppBroadcastItem): Promise<string[]> {
    const supabase = createServiceRoleClient()

    if (broadcast.audience === 'individual') {
      return broadcast.targetUserId ? [broadcast.targetUserId] : []
    }

    if (broadcast.audience === 'cohort') {
      if (!broadcast.targetCohortId) return []
      const { data } = await supabase
        .from('cohort_members')
        .select('user_id')
        .eq('cohort_id', broadcast.targetCohortId)

      return ((data || []) as Array<{ user_id: string }>).map((m) => m.user_id)
    }

    if (broadcast.audience === 'filtered') {
      const { userIds } = await queryUserIds(broadcast.recipientFilters || {})
      return userIds
    }

    // Default 'all': query all active users using empty filter definition
    const { userIds } = await queryUserIds({})
    return userIds
  }

  /**
   * Executes immediate delivery of an in-app notification broadcast.
   */
  static async executeBroadcast(
    id: string
  ): Promise<{ success: boolean; targeted: number; delivered: number; error?: string }> {
    const supabase = createServiceRoleClient()

    // 1. Fetch & lock broadcast
    const broadcast = await this.getBroadcast(id)
    if (!broadcast) return { success: false, targeted: 0, delivered: 0, error: 'Broadcast not found.' }

    if (['completed', 'sending'].includes(broadcast.status)) {
      return {
        success: false,
        targeted: broadcast.totalTargeted,
        delivered: broadcast.totalDelivered,
        error: `Broadcast is already ${broadcast.status}.`,
      }
    }

    // Set status to 'sending'
    await supabase
      .from('in_app_broadcasts')
      .update({ status: 'sending', updated_at: new Date().toISOString() })
      .eq('id', id)

    try {
      // 2. Resolve recipients via unified filtering engine
      const recipientIds = await this.resolveRecipients(broadcast)
      const targetedCount = recipientIds.length

      if (targetedCount === 0) {
        await supabase
          .from('in_app_broadcasts')
          .update({
            status: 'completed',
            sent_at: new Date().toISOString(),
            total_targeted: 0,
            total_delivered: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        return { success: true, targeted: 0, delivered: 0 }
      }

      // 3. Dispatch to each recipient with idempotency key
      let deliveredCount = 0
      const priorityKey = mapPriorityToMatrixKey(broadcast.priority)

      for (const userId of recipientIds) {
        const itemKey = `inapp-${broadcast.id}-${userId}`
        const res = await createInAppNotification({
          userId,
          idempotencyKey: itemKey,
          category: broadcast.category,
          title: broadcast.title,
          body: broadcast.body,
          actionUrl: broadcast.actionUrl || undefined,
          priority: priorityKey,
        })

        if (res.success) {
          deliveredCount++
        }
      }

      // 4. Mark broadcast completed
      await supabase
        .from('in_app_broadcasts')
        .update({
          status: 'completed',
          sent_at: new Date().toISOString(),
          total_targeted: targetedCount,
          total_delivered: deliveredCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      return { success: true, targeted: targetedCount, delivered: deliveredCount }
    } catch (err) {
      console.error('[InAppManagerService.executeBroadcast] Execution error:', err)
      await supabase
        .from('in_app_broadcasts')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', id)

      return {
        success: false,
        targeted: 0,
        delivered: 0,
        error: err instanceof Error ? err.message : 'Execution failed',
      }
    }
  }

  /**
   * Cron processor for scheduled in-app broadcasts past their scheduled_at timestamp.
   */
  static async processScheduledInAppBroadcasts(): Promise<{ processed: number; errors: string[] }> {
    const supabase = createServiceRoleClient()
    const now = new Date().toISOString()
    const errors: string[] = []
    let processed = 0

    try {
      const { data, error } = await supabase
        .from('in_app_broadcasts')
        .select('id, title, scheduled_at')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(10)

      if (error || !data) return { processed: 0, errors: error ? [error.message] : [] }

      for (const row of data) {
        try {
          const res = await this.executeBroadcast(row.id)
          if (res.success) {
            processed++
          } else if (res.error) {
            errors.push(`[${row.title}] ${res.error}`)
          }
        } catch (execErr) {
          errors.push(
            `[${row.title}] ${execErr instanceof Error ? execErr.message : 'Execution error'}`
          )
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : 'Cron query error')
    }

    return { processed, errors }
  }
}
