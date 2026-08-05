import type { NotificationPriorityLevel, PriorityDefinition } from '../types'
import type { RetryDelayPolicy, RateLimitPolicyCheck } from './types'
import { PRIORITY_MATRIX } from '../constants'

/**
 * Priority Matrix Service for Notification Platform
 */
export class PriorityMatrix {
  /**
   * Retrieves priority definition metadata for a given level.
   */
  public getDefinition(level: NotificationPriorityLevel): PriorityDefinition {
    return PRIORITY_MATRIX[level] || PRIORITY_MATRIX.medium
  }

  /**
   * Calculates exponential backoff retry delay based on priority level and attempt count.
   */
  public calculateRetryDelay(
    level: NotificationPriorityLevel,
    attemptCount: number,
    baseDate: Date = new Date()
  ): RetryDelayPolicy {
    const def = this.getDefinition(level)
    const isMaxExceeded = attemptCount >= def.maxRetries

    if (isMaxExceeded) {
      return {
        attemptCount,
        delayMinutes: 0,
        nextRetryAt: baseDate,
        isMaxAttemptsExceeded: true,
      }
    }

    // Exponential factor based on attempt count
    const multiplier = Math.pow(2, Math.max(0, attemptCount - 1))
    const delayMinutes = def.initialRetryDelayMinutes * multiplier
    const nextRetryAt = new Date(baseDate.getTime() + delayMinutes * 60 * 1000)

    return {
      attemptCount,
      delayMinutes,
      nextRetryAt,
      isMaxAttemptsExceeded: false,
    }
  }

  /**
   * Evaluates whether a priority level can bypass user rate limits.
   */
  public evaluateRateLimitBypass(level: NotificationPriorityLevel): RateLimitPolicyCheck {
    const def = this.getDefinition(level)
    if (def.allowBypassRateLimits) {
      return {
        isAllowed: true,
        reason: `Priority '${level}' bypasses rate limits per Priority Matrix policy`,
        priority: level,
      }
    }

    return {
      isAllowed: false,
      priority: level,
    }
  }

  /**
   * Evaluates whether a priority level can bypass user preferences (security/critical alerts).
   */
  public evaluatePreferenceBypass(level: NotificationPriorityLevel): boolean {
    return this.getDefinition(level).allowBypassPreferences
  }
}

export const globalPriorityMatrix = new PriorityMatrix()
