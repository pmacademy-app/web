export type StandardFeatureFlagKey = 
  | 'EMAIL_ENABLED'
  | 'WEEKLY_RECAP_ENABLED'
  | 'ACHIEVEMENT_EMAIL_ENABLED'
  | 'IN_APP_NOTIFICATIONS_ENABLED'
  | 'ACHIEVEMENT_CELEBRATIONS_ENABLED'
  | 'MODULE_CELEBRATIONS_ENABLED'
  | 'PORTFOLIO_EMAILS_ENABLED'
  | 'MARKETING_EMAILS_ENABLED'
  | 'QUEUE_PROCESSING_ENABLED'
  | 'SCHEDULER_ENABLED'

export interface FeatureFlagRecord {
  key: string
  description?: string
  enabled: boolean
  updatedAt: string
}
