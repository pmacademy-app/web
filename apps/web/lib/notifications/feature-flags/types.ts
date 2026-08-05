export type StandardFeatureFlagKey = 
  | 'EMAIL_ENABLED'
  | 'WEEKLY_RECAP_ENABLED'
  | 'BADGE_EMAILS_ENABLED'
  | 'IN_APP_NOTIFICATIONS_ENABLED'
  | 'PORTFOLIO_EMAILS_ENABLED'
  | 'DAILY_REMINDERS_ENABLED'
  | 'MARKETING_EMAILS_ENABLED'
  | 'QUEUE_PROCESSING_ENABLED'

export interface FeatureFlagRecord {
  key: string
  description?: string
  enabled: boolean
  updatedAt: string
}
