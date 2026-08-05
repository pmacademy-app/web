import type { NotificationPriorityLevel, NotificationChannel } from '../types'

export type QueueStatus = 
  | 'pending'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'suppressed'

export interface RetryMetadata {
  attemptCount: number
  maxAttempts: number
  nextRetryAt?: string
  lastError?: string
}

export interface QueuedNotificationItem {
  id: string
  userId: string
  toEmail?: string
  toName?: string
  channel: NotificationChannel
  templateKey: string
  templateVariables: Record<string, unknown>
  eventId?: string
  eventType: string
  priority: number // numeric priority 1-10
  priorityLevel: NotificationPriorityLevel
  status: QueueStatus
  retry: RetryMetadata
  scheduledAt: string
  processingAt?: string
  deliveredAt?: string
  failedAt?: string
  resendId?: string
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface DeadLetterRecord {
  id: string
  originalQueueId: string
  userId: string
  templateKey: string
  templateVariables: Record<string, unknown>
  failureReason: string
  allErrors: Array<{ attempt: number; error: string; timestamp: string }>
  createdAt: string
}
