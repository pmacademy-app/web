import type { NotificationChannel } from '../types'

export type AnalyticsDeliveryStatus = 
  | 'queued' 
  | 'delivered' 
  | 'opened' 
  | 'clicked' 
  | 'failed' 
  | 'suppressed'

export interface NotificationMetricEvent {
  id: string
  templateKey: string
  channel: NotificationChannel
  status: AnalyticsDeliveryStatus
  timestamp: string
  userId?: string
  metadata?: Record<string, unknown>
}

export interface NotificationAnalyticsAggregate {
  templateKey: string
  queuedCount: number
  deliveredCount: number
  openedCount: number
  clickedCount: number
  failedCount: number
  suppressedCount: number
  openRatePercent: number
  clickRatePercent: number
}
