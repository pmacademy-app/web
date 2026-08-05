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

export class AdminFoundationService implements NotificationAdminServices {
  public async getSystemStatus(): Promise<SystemStatusSummary> {
    const flags = globalFeatureFlagService
    const providers = globalProviderRegistry.getAllProviders()

    return {
      isQueueProcessingEnabled: flags.isEnabled('QUEUE_PROCESSING_ENABLED'),
      isEmailEnabled: flags.isEnabled('EMAIL_ENABLED'),
      isInAppEnabled: flags.isEnabled('IN_APP_NOTIFICATIONS_ENABLED'),
      activeProviders: providers.map((p) => p.name),
      queuePendingCount: 0,
      queueFailedCount: 0,
      dailySendsCount: 0,
      dailySendLimit: GLOBAL_RATE_LIMITS.DAILY_SEND_LIMIT,
      lastCronExecutionTime: new Date().toISOString(),
    }
  }

  public async inspectQueue(filter?: { status?: string; limit?: number }): Promise<QueueInspectionResult> {
    void filter
    // Foundation scaffold query result
    return {
      items: [],
      totalPending: 0,
      totalProcessing: 0,
      totalFailed: 0,
      totalDeadLetter: 0,
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
    // Scaffold default fallback for preference inspection
    return createDefaultNotificationPreferences(userId)
  }

  public async getUserTimeline(
    userId: string,
    limit?: number
  ): Promise<UserNotificationTimelineRecord[]> {
    void userId
    void limit
    return []
  }
}

export const globalAdminFoundationService = new AdminFoundationService()
