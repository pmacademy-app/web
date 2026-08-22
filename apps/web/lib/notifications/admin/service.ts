import type {
  NotificationAdminServices,
  SystemStatusSummary,
  QueueInspectionResult,
} from './types'
import type { FeatureFlagRecord } from '../feature-flags/types'
import type { TemplateMetadata } from '../templates/types'
import type { UserNotificationTimelineRecord } from '../timeline/types'
import type { UserNotificationPreferences } from '../preferences/types'

import { globalFeatureFlagService } from '../feature-flags/service'
import { globalTemplateRegistry } from '../templates/registry'
import { globalProviderRegistry } from '../providers'
import { GLOBAL_RATE_LIMITS } from '../constants'
import { createDefaultNotificationPreferences } from '../preferences/defaults'
import { createServiceRoleClient } from '../../supabase'

export class AdminFoundationService implements NotificationAdminServices {
  public async getSystemStatus(): Promise<SystemStatusSummary> {
    const flags = globalFeatureFlagService
    const providers = globalProviderRegistry.getAllProviders()
    const supabase = createServiceRoleClient()

    let pendingCount = 0
    let failedCount = 0
    let dailyCount = 0

    try {
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

      const [pendingRes, failedRes, dailyRes] = await Promise.all([
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).gte('created_at', todayIso),
      ])

      pendingCount = pendingRes.count ?? 0
      failedCount = failedRes.count ?? 0
      dailyCount = dailyRes.count ?? 0
    } catch (e) {
      console.warn('[AdminFoundationService] Error querying system status counts:', e)
    }

    return {
      isQueueProcessingEnabled: flags.isEnabled('QUEUE_PROCESSING_ENABLED'),
      isEmailEnabled: flags.isEnabled('EMAIL_ENABLED'),
      isInAppEnabled: flags.isEnabled('IN_APP_NOTIFICATIONS_ENABLED'),
      activeProviders: providers.map((p) => p.name),
      queuePendingCount: pendingCount,
      queueFailedCount: failedCount,
      dailySendsCount: dailyCount,
      dailySendLimit: GLOBAL_RATE_LIMITS.DAILY_SEND_LIMIT,
      lastCronExecutionTime: new Date().toISOString(),
    }
  }

  public async inspectQueue(filter?: { status?: string; limit?: number }): Promise<QueueInspectionResult> {
    const supabase = createServiceRoleClient()
    const limit = filter?.limit || 50

    try {
      let query = supabase.from('email_queue').select('*').order('created_at', { ascending: false }).limit(limit)
      if (filter?.status && filter.status !== 'all') {
        query = query.eq('status', filter.status)
      }

      const [itemsRes, pendingRes, procRes, failedRes, deadRes] = await Promise.all([
        query,
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'processing'),
        supabase.from('email_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
        supabase.from('email_dead_letter').select('id', { count: 'exact', head: true }),
      ])

      const rawItems = (itemsRes.data as Array<Record<string, unknown>>) || []
      const items = rawItems.map((r) => ({
        id: String(r.id || ''),
        userId: String(r.user_id || ''),
        toEmail: r.recipient_email ? String(r.recipient_email) : undefined,
        toName: r.recipient_name ? String(r.recipient_name) : undefined,
        channel: 'email' as const,
        templateKey: String(r.template_key || ''),
        templateVariables: (r.template_data as Record<string, unknown>) || {},
        eventType: String(r.event_type || 'custom'),
        priority: typeof r.priority === 'number' ? r.priority : 5,
        priorityLevel: 'medium' as const,
        status: (r.status as any) || 'pending',
        retry: {
          attemptCount: Number(r.attempt_count || 0),
          maxAttempts: Number(r.max_attempts || 3),
          nextRetryAt: r.next_retry_at ? String(r.next_retry_at) : undefined,
          lastError: r.last_error ? String(r.last_error) : undefined,
        },
        scheduledAt: String(r.scheduled_at || r.created_at || new Date().toISOString()),
        processingAt: r.processing_at ? String(r.processing_at) : undefined,
        deliveredAt: r.delivered_at ? String(r.delivered_at) : undefined,
        failedAt: r.failed_at ? String(r.failed_at) : undefined,
        resendId: r.resend_id ? String(r.resend_id) : undefined,
        errorMessage: r.last_error ? String(r.last_error) : undefined,
        createdAt: String(r.created_at || new Date().toISOString()),
        updatedAt: String(r.updated_at || new Date().toISOString()),
      }))

      return {
        items,
        totalPending: pendingRes.count ?? 0,
        totalProcessing: procRes.count ?? 0,
        totalFailed: failedRes.count ?? 0,
        totalDeadLetter: deadRes.count ?? 0,
      }
    } catch (e) {
      console.error('[AdminFoundationService] Error inspecting queue:', e)
      return {
        items: [],
        totalPending: 0,
        totalProcessing: 0,
        totalFailed: 0,
        totalDeadLetter: 0,
      }
    }
  }

  public inspectTemplates(): TemplateMetadata[] {
    return globalTemplateRegistry.getAllTemplates()
  }

  public inspectFeatureFlags(): FeatureFlagRecord[] {
    return globalFeatureFlagService.getAll()
  }

  public toggleFeatureFlag(key: string, enabled: boolean): FeatureFlagRecord {
    if (enabled) {
      return globalFeatureFlagService.enable(key)
    }
    return globalFeatureFlagService.disable(key)
  }

  public async getUserPreferences(userId: string): Promise<UserNotificationPreferences | null> {
    try {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      if (data) return data as unknown as UserNotificationPreferences
    } catch {
      // Fallback to default
    }
    return createDefaultNotificationPreferences(userId)
  }

  public async getUserTimeline(
    userId: string,
    limit?: number
  ): Promise<UserNotificationTimelineRecord[]> {
    try {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('user_notification_timeline')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit || 50)

      if (data) return data as unknown as UserNotificationTimelineRecord[]
    } catch (e) {
      console.error('[AdminFoundationService] Error querying user timeline:', e)
    }
    return []
  }
}

export const globalAdminFoundationService = new AdminFoundationService()

