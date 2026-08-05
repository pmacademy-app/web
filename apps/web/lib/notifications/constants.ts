import type { PriorityDefinition, NotificationPriorityLevel } from './types'

/**
 * Notification Priority Matrix Definitions
 */
export const PRIORITY_MATRIX: Record<NotificationPriorityLevel, PriorityDefinition> = {
  critical: {
    name: 'critical',
    numericValue: 1,
    maxRetries: 5,
    initialRetryDelayMinutes: 1,
    rateLimitCategory: 'none',
    allowBypassPreferences: true,
    allowBypassRateLimits: true,
  },
  high: {
    name: 'high',
    numericValue: 2,
    maxRetries: 3,
    initialRetryDelayMinutes: 5,
    rateLimitCategory: 'none',
    allowBypassPreferences: false,
    allowBypassRateLimits: true,
  },
  medium: {
    name: 'medium',
    numericValue: 5,
    maxRetries: 3,
    initialRetryDelayMinutes: 15,
    rateLimitCategory: 'standard',
    allowBypassPreferences: false,
    allowBypassRateLimits: false,
  },
  low: {
    name: 'low',
    numericValue: 8,
    maxRetries: 2,
    initialRetryDelayMinutes: 60,
    rateLimitCategory: 'reminders',
    allowBypassPreferences: false,
    allowBypassRateLimits: false,
  },
  bulk: {
    name: 'bulk',
    numericValue: 10,
    maxRetries: 1,
    initialRetryDelayMinutes: 240,
    rateLimitCategory: 'marketing',
    allowBypassPreferences: false,
    allowBypassRateLimits: false,
  },
}

/**
 * Global Rate Limit Thresholds for Resend Free Tier Protection
 */
export const GLOBAL_RATE_LIMITS = {
  DAILY_SEND_LIMIT: 90,     // Buffer below 100/day free limit
  HOURLY_SEND_LIMIT: 30,    // Smooth hourly distribution
  PER_USER_DAILY_ACHIEVEMENT_LIMIT: 3,
  PER_USER_DAILY_REMINDER_LIMIT: 1,
  PER_USER_WEEKLY_RECAP_LIMIT: 1,
} as const

/**
 * System Timeouts & Processing Window Constants
 */
export const QUEUE_CONSTANTS = {
  BATCH_SIZE: 50,
  EXECUTION_TIMEOUT_MS: 55000,
  CACHE_TTL_SECONDS: 300,
} as const
