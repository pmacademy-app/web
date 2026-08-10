export type EmailAutomationKey =
  | 'auth.welcome'
  | 'auth.verify_email'
  | 'auth.password_reset'
  | 'learning.module_complete'
  | 'achievement.badge_earned'
  | 'achievement.level_up'
  | 'achievement.certificate'
  | 'achievement.portfolio_published'
  | 'learning.weekly_recap'
  | 'learning.daily_reminder'
  | 'inactive.resume_learning'

export interface EmailAutomationMeta {
  key: EmailAutomationKey
  name: string
  description: string
  category: 'Transactional' | 'Scheduled' | 'System'
  isCritical: boolean
  isDeferred?: boolean
  enabled: boolean
}

export interface EmailAutomationsState {
  globalPause: boolean
  dailyLimit: number
  dailySentCount: number
  automations: EmailAutomationMeta[]
}
