export type StandardFeatureFlagKey = 
  | 'EMAIL_ENABLED'
  | 'WEEKLY_RECAP_ENABLED'
  | 'ACHIEVEMENT_EMAIL_ENABLED'
  | 'IN_APP_NOTIFICATIONS_ENABLED'
  | 'PORTFOLIO_EMAILS_ENABLED'
  | 'MARKETING_EMAILS_ENABLED'
  | 'QUEUE_PROCESSING_ENABLED'
  | 'GITHUB_ACTIONS_SCHEDULER_ENABLED'

export interface FeatureFlagRecord {
  key: string
  description?: string
  enabled: boolean
  updatedAt: string
}
