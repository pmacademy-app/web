/**
 * Core Types for PM Academy Notification Platform Foundation
 */

export type NotificationPriorityLevel = 'critical' | 'high' | 'medium' | 'low' | 'bulk'

export interface PriorityDefinition {
  name: NotificationPriorityLevel
  numericValue: number // 1=critical, 2=high, 5=medium, 8=low, 10=bulk
  maxRetries: number
  initialRetryDelayMinutes: number
  rateLimitCategory: string
  allowBypassPreferences: boolean
  allowBypassRateLimits: boolean
}

export type NotificationChannel = 
  | 'email' 
  | 'in_app' 
  | 'push' 
  | 'sms' 
  | 'whatsapp' 
  | 'slack' 
  | 'discord'

export type NotificationCategory = 
  | 'security'
  | 'learning'
  | 'achievements'
  | 'portfolio'
  | 'certificates'
  | 'product_updates'
  | 'marketing'

export interface NotificationActor {
  userId: string
  email?: string
  name?: string
}

export interface NotificationMetadata {
  sourceRoute?: string
  correlationId?: string
  clientIp?: string
  userAgent?: string
  [key: string]: unknown
}

export interface EventEnvelope<T = Record<string, unknown>> {
  id: string
  event: string
  userId: string
  userEmail: string
  userName: string
  userTimezone: string
  occurredAt: string
  priority: NotificationPriorityLevel
  category: NotificationCategory
  payload: T
  actor?: NotificationActor
  metadata?: NotificationMetadata
}

export interface NotificationEventDefinition {
  eventName: string
  category: NotificationCategory
  defaultPriority: NotificationPriorityLevel
  description: string
  validatePayload: (payload: unknown) => boolean
}
