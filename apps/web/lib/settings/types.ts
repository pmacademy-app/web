/**
 * Shapes of the platform settings stored in `system_settings` and read by
 * `SettingsService` (lib/settings/system-settings-service.ts). The admin console
 * (separate repository) edits them; the learner app only reads them.
 */

export type SettingsSectionKey = 'product' | 'learning' | 'email' | 'notifications' | 'feature-flags' | 'onboarding'

export interface ProductSettings {
  // General
  siteName: string
  siteDescription: string
  contactEmail: string
  // Platform Behavior
  maintenanceMode: boolean
  allowSignups: boolean
  requireEmailVerification: boolean
  sessionTimeoutMinutes: number
}

export interface LearningSettings {
  // XP
  xpPerLessonComplete: number
  xpPerQuizPass: number
  xpPerFlashcardReview: number
  xpPerReflection: number
  /** XP the referrer earns when an invited learner completes their first lesson. */
  xpReferralReward: number
  /** Bonus for a perfect first quiz attempt (0 turns it off). */
  xpQuizPerfectBonus: number
  xpPerCapstoneSubmitted: number
  /** Base XP for keeping the daily streak going. */
  xpStreakBaseReward: number
  /**
   * Set to 2 when saved by the reconciled admin form. Only such a record drives runtime XP
   * (lib/xp/xp.ts); older records are ignored. Written by the server, never by the form.
   */
  xpSettingsVersion?: number
  /**
   * Handed out with every read and echoed by the form on save: proof the form was loaded from the
   * reconciled XP values. A save without it keeps the current XP numbers. Never stored.
   */
  xpFormVersion?: number
  // Streaks
  streakFreezeEnabled: boolean
  streakFreezeCostXp: number
  // Certificates
  certificateAutoIssue: boolean
  certificateExpiryDays: number | null
  // Learning Behavior
  lessonCompletionRequiredForProgress: boolean
  quizPassThreshold: number
}

export interface EmailSettings {
  // Sending
  fromName: string
  fromEmail: string
  replyToEmail: string
  // Limits
  dailySendLimit: number
  hourlySendLimit: number
  // Sender (read-only from env)
  resendApiKeyConfigured: boolean
  // Automation
  retryFailedEmails: boolean
  maxRetryAttempts: number
  retryDelayMinutes: number
}

export interface NotificationSettings {
  // Reminders
  dailyReminderEnabled: boolean
  dailyReminderTime: string // HH:MM
  inactivityReminderDays: number
  // Weekly Recap
  weeklyRecapEnabled: boolean
  weeklyRecapDay: number // 0-6 (Sunday=0)
  weeklyRecapTime: string // HH:MM
  // Defaults
  defaultInAppEnabled: boolean
  defaultEmailEnabled: boolean
}

export interface OnboardingFieldOption {
  id: string
  label: string
  description?: string
  badge?: string
  icon?: string
  enabled?: boolean
  recommendedModule?: string
}

/**
 * Phase 4C: the learner onboarding is a single focused screen collecting goal +
 * experience (see `app/onboarding/OnboardingWizard.tsx` and ADR-007). The former 4-step
 * wizard model (editable steps, per-step required fields, topic and learning-preference
 * selection) was removed here because nothing in the live flow consumed it. Only the
 * `goal` and `experience_level` option lists drive the live screen, so those are the only
 * configurable groups. The optional index signature tolerates legacy option groups that
 * may still exist in stored settings JSON without resurrecting them in the Admin UI.
 */
export interface OnboardingSettings {
  /** Master switch for the learner onboarding screen. */
  enabled: boolean
  fieldOptions?: {
    goal?: OnboardingFieldOption[]
    experience_level?: OnboardingFieldOption[]
    [key: string]: OnboardingFieldOption[] | undefined
  }
}

export interface SettingsResponse<T> {
  success: boolean
  data?: T
  error?: string
  failed?: boolean
}
