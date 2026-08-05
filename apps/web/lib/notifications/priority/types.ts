import type { NotificationPriorityLevel } from '../types'

export interface RetryDelayPolicy {
  attemptCount: number
  delayMinutes: number
  nextRetryAt: Date
  isMaxAttemptsExceeded: boolean
}

export interface RateLimitPolicyCheck {
  isAllowed: boolean
  reason?: string
  priority: NotificationPriorityLevel
}
