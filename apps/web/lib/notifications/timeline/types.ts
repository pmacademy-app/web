import type { NotificationChannel, NotificationPriorityLevel } from '../types'
import type { QueueStatus } from '../queue/types'

export interface UserNotificationTimelineRecord {
  id: string
  userId: string
  eventId?: string
  channel: NotificationChannel
  templateKey: string
  templateVersion: number
  status: QueueStatus
  priority: NotificationPriorityLevel
  queuedAt: string
  sentAt?: string
  deliveredAt?: string
  openedAt?: string
  clickedAt?: string
  failedAt?: string
  suppressedAt?: string
  errorDetails?: string
  resendId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}
