export type EmailAutomationKey =
  | 'auth.welcome'
  | 'auth.verify_email'
  | 'auth.password_reset'
  | 'auth.email_change_verify'
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

export interface WeeklyRecapSchedule {
  enabled: boolean
  dayOfWeek: number // 0=Sunday, 1=Monday, ..., 6=Saturday (Default 1: Monday)
  hourUtc: number   // 0..23 (Default 3: 03:30 UTC / 09:00 AM IST window)
  lastRunAt?: string | null
}

export interface DailyReminderSchedule {
  enabled: boolean
  hourUtc: number   // 0..23 (Default 3: 03:30 UTC / 09:00 AM IST window)
  lastRunAt?: string | null
}

export interface EmailDigestSchedules {
  weeklyRecap: WeeklyRecapSchedule
  dailyReminder: DailyReminderSchedule
}

export interface EmailAutomationsState {
  globalPause: boolean
  dailyLimit: number
  dailySentCount: number
  resendOutboundCount: number
  automations: EmailAutomationMeta[]
  digestSchedules: EmailDigestSchedules
}
