import type { FeatureFlagRecord } from '../feature-flags/types'
import type { QueuedNotificationItem } from '../queue/types'
import type { TemplateMetadata } from '../templates/types'
import type { UserNotificationTimelineRecord } from '../timeline/types'
import type { UserNotificationPreferences } from '../preferences/types'

export interface SystemStatusSummary {
  isQueueProcessingEnabled: boolean
  isEmailEnabled: boolean
  isInAppEnabled: boolean
  activeProviders: string[]
  queuePendingCount: number
  queueFailedCount: number
  dailySendsCount: number
  dailySendLimit: number
  lastCronExecutionTime?: string
}

export interface QueueInspectionResult {
  items: QueuedNotificationItem[]
  totalPending: number
  totalProcessing: number
  totalFailed: number
  totalDeadLetter: number
}

export interface NotificationAdminServices {
  getSystemStatus(): Promise<SystemStatusSummary>
  inspectQueue(filter?: { status?: string; limit?: number }): Promise<QueueInspectionResult>
  inspectTemplates(): TemplateMetadata[]
  inspectFeatureFlags(): FeatureFlagRecord[]
  toggleFeatureFlag(key: string, enabled: boolean): FeatureFlagRecord
  getUserPreferences(userId: string): Promise<UserNotificationPreferences | null>
  getUserTimeline(userId: string, limit?: number): Promise<UserNotificationTimelineRecord[]>
}
