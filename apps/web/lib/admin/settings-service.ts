import { createServiceRoleClient } from '../supabase'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'
import type {
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
  OnboardingSettings,
  SettingsSectionKey,
} from './types'
import type { FeatureFlagRecord } from '../notifications/feature-flags/types'

/**
 * Settings Service (Phase 8).
 *
 * Manages platform configuration stored in `system_settings` table.
 * Each section is a separate JSONB row keyed by section name.
 * Follows the same pattern as FeatureFlagService for persistence.
 */

const SETTINGS_KEYS: Record<SettingsSectionKey, string> = {
  product: 'product_settings',
  learning: 'learning_settings',
  email: 'email_settings',
  notifications: 'notification_settings',
  'feature-flags': 'feature_flags',
  onboarding: 'onboarding_settings',
}

// Default values for each section (used when no DB record exists)
const DEFAULT_PRODUCT_SETTINGS: ProductSettings = {
  siteName: 'Prodily',
  siteDescription: 'Product Management Academy',
  contactEmail: 'support@prodily.app',
  maintenanceMode: false,
  allowSignups: true,
  requireEmailVerification: true,
  sessionTimeoutMinutes: 10080, // 7 days
}

const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  xpPerLessonComplete: 50,
  xpPerQuizPass: 100,
  xpPerFlashcardReview: 10,
  xpPerReflection: 25,
  streakFreezeEnabled: true,
  streakFreezeCostXp: 500,
  certificateAutoIssue: true,
  certificateExpiryDays: null,
  lessonCompletionRequiredForProgress: true,
  quizPassThreshold: 70,
}

const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  fromName: 'Prodily',
  fromEmail: 'noreply@prodily.app',
  replyToEmail: 'support@prodily.app',
  dailySendLimit: 1000,
  hourlySendLimit: 100,
  resendApiKeyConfigured: false, // Will be overridden by env check
  retryFailedEmails: true,
  maxRetryAttempts: 3,
  retryDelayMinutes: 30,
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  inactivityReminderDays: 7,
  weeklyRecapEnabled: true,
  weeklyRecapDay: 1, // Monday
  weeklyRecapTime: '09:00',
  defaultInAppEnabled: true,
  defaultEmailEnabled: false,
}

const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  enabled: true,
  steps: [
    {
      id: 'step_goal',
      title: 'What is your main goal?',
      description: 'Help us personalize your curriculum.',
      requiredFields: ['goal']
    },
    {
      id: 'step_profile',
      title: 'Complete your profile',
      description: 'Add your details to get started.',
      requiredFields: ['role', 'experience']
    }
  ]
}

function getDefaultSettings<T>(section: SettingsSectionKey): T {
  switch (section) {
    case 'product':
      return DEFAULT_PRODUCT_SETTINGS as T
    case 'learning':
      return DEFAULT_LEARNING_SETTINGS as T
    case 'email':
      return DEFAULT_EMAIL_SETTINGS as T
    case 'notifications':
      return DEFAULT_NOTIFICATION_SETTINGS as T
    case 'onboarding':
      return DEFAULT_ONBOARDING_SETTINGS as T
    default:
      return {} as T
  }
}

export class SettingsService {
  /**
   * Generic fetch for a settings section.
   * Returns defaults if no record exists or on error.
   */
  private static async getSettings<T>(section: SettingsSectionKey): Promise<T> {
    const supabase = createServiceRoleClient()
    const key = SETTINGS_KEYS[section]

    try {
      type DBSelect = {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            maybeSingle: () => Promise<{ data: { value: unknown } | null; error: { message: string } | null }>
          }
        }
      }
      const { data, error } = await (supabase.from('system_settings') as unknown as DBSelect)
        .select('value')
        .eq('key', key)
        .maybeSingle()

      if (error) throw new Error(error.message)

      const rawValue = data?.value
      if (rawValue && typeof rawValue === 'object') {
        // Merge with defaults to ensure all keys exist
        return { ...getDefaultSettings<T>(section), ...(rawValue as T) }
      }

      return getDefaultSettings<T>(section)
    } catch (err) {
      console.warn(`[SettingsService] getSettings(${section}) failed:`, err)
      return getDefaultSettings<T>(section)
    }
  }

  /**
   * Generic upsert for a settings section.
   */
  private static async upsertSettings<T>(section: SettingsSectionKey, value: T): Promise<T> {
    const supabase = createServiceRoleClient()
    const key = SETTINGS_KEYS[section]

    try {
      type DBChain = { upsert: (row: unknown) => Promise<{ error: unknown }> }
      await (supabase.from('system_settings') as unknown as DBChain).upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      })
      return value
    } catch (err) {
      console.warn(`[SettingsService] upsertSettings(${section}) failed:`, err)
      throw new Error(`Failed to save ${section} settings`)
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  public static async getProductSettings(): Promise<ProductSettings> {
    return this.getSettings<ProductSettings>('product')
  }

  public static async getLearningSettings(): Promise<LearningSettings> {
    return this.getSettings<LearningSettings>('learning')
  }

  public static async getEmailSettings(): Promise<EmailSettings> {
    const settings = await this.getSettings<EmailSettings>('email')
    // Override read-only field with actual env status
    return {
      ...settings,
      resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    }
  }

  public static async getNotificationSettings(): Promise<NotificationSettings> {
    return this.getSettings<NotificationSettings>('notifications')
  }

  public static async getOnboardingSettings(): Promise<OnboardingSettings> {
    return this.getSettings<OnboardingSettings>('onboarding')
  }

  public static async getFeatureFlags(): Promise<FeatureFlagRecord[]> {
    return globalFeatureFlagService.getAll()
  }

  public static async updateProductSettings(
    partial: Partial<ProductSettings>
  ): Promise<ProductSettings> {
    const current = await this.getProductSettings()
    const updated = { ...current, ...partial }
    return this.upsertSettings('product', updated)
  }

  public static async updateLearningSettings(
    partial: Partial<LearningSettings>
  ): Promise<LearningSettings> {
    const current = await this.getLearningSettings()
    const updated = { ...current, ...partial }
    return this.upsertSettings('learning', updated)
  }

  public static async updateEmailSettings(
    partial: Partial<EmailSettings>
  ): Promise<EmailSettings> {
    const current = await this.getEmailSettings()
    // Don't allow overwriting read-only field
    const allowed = { ...partial }
    delete (allowed as { resendApiKeyConfigured?: boolean }).resendApiKeyConfigured
    const updated = { ...current, ...allowed }
    return this.upsertSettings('email', updated)
  }

  public static async updateNotificationSettings(
    partial: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    const current = await this.getNotificationSettings()
    const updated = { ...current, ...partial }
    return this.upsertSettings('notifications', updated)
  }

  public static async updateOnboardingSettings(
    partial: Partial<OnboardingSettings>
  ): Promise<OnboardingSettings> {
    const current = await this.getOnboardingSettings()
    const updated = { ...current, ...partial }
    return this.upsertSettings('onboarding', updated)
  }

  /**
   * Get all settings at once (for initial page load).
   */
  public static async getAllSettings(): Promise<{
    product: ProductSettings
    learning: LearningSettings
    email: EmailSettings
    notifications: NotificationSettings
    onboarding: OnboardingSettings
    featureFlags: FeatureFlagRecord[]
  }> {
    const [product, learning, email, notifications, onboarding, featureFlags] = await Promise.all([
      this.getProductSettings(),
      this.getLearningSettings(),
      this.getEmailSettings(),
      this.getNotificationSettings(),
      this.getOnboardingSettings(),
      this.getFeatureFlags(),
    ])
    return { product, learning, email, notifications, onboarding, featureFlags }
  }
}