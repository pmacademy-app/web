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

import {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
  DEFAULT_ONBOARDING_STEPS,
} from './onboarding-defaults'

// Moved to `./onboarding-defaults` (client-safe) and re-exported so existing
// server call sites are unchanged. A browser consumer must import them from
// that module directly — importing them from here pulls this service, the
// service-role client and the system_settings query code into the bundle.
export {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
  DEFAULT_ONBOARDING_STEPS,
} from './onboarding-defaults'


const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  enabled: true,
  steps: DEFAULT_ONBOARDING_STEPS,
  fieldOptions: {
    goal: DEFAULT_GOAL_OPTIONS,
    experience_level: DEFAULT_EXPERIENCE_OPTIONS,
    topics: DEFAULT_TOPIC_OPTIONS,
    learning_preference: DEFAULT_PREFERENCE_OPTIONS,
  },
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
  private static sectionCache = new Map<string, { value: unknown; timestamp: number }>()
  private static readonly CACHE_TTL_MS = 60_000 // 60 seconds L1 in-memory TTL

  /**
   * Generic fetch for a settings section with in-memory caching.
   * Returns defaults if no record exists or on error.
   */
  private static async getSettings<T>(section: SettingsSectionKey): Promise<T> {
    const now = Date.now()
    const cached = this.sectionCache.get(section)
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.value as T
    }

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

      let result: T = getDefaultSettings<T>(section)
      const rawValue = data?.value
      if (rawValue && typeof rawValue === 'object') {
        // Merge with defaults to ensure all keys exist
        result = { ...getDefaultSettings<T>(section), ...(rawValue as T) }
      }

      this.sectionCache.set(section, { value: result, timestamp: now })
      return result
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
      SettingsService.invalidateCache()
      return value
    } catch (err) {
      console.warn(`[SettingsService] upsertSettings(${section}) failed:`, err)
      throw new Error(`Failed to save ${section} settings`)
    }
  }

  // ─── Settings Cache & Helpers ─────────────────────────────────────────────

  /**
   * Fast, resilient server-side check for email verification requirement.
   * Returns true (require verification) if not explicitly set to false.
   */
  public static async isEmailVerificationRequired(): Promise<boolean> {
    try {
      const product = await this.getProductSettings()
      return typeof product.requireEmailVerification === 'boolean' ? product.requireEmailVerification : true
    } catch {
      return true
    }
  }

  /**
   * Manually invalidate settings cache (e.g. after Admin Panel save or in unit tests).
   */
  public static invalidateCache(): void {
    this.sectionCache.clear()
    try {
      // Revalidate Next.js Data Cache tag across serverless instances
      import('next/cache').then(({ revalidateTag }) => {
        if (typeof revalidateTag === 'function') {
          try {
            ;(revalidateTag as (tag: string, profile?: string) => void)('system_settings')
          } catch {
            ;(revalidateTag as (tag: string, profile?: string) => void)('system_settings', 'max')
          }
        }
      }).catch(() => {
        // Non-fatal if next/cache is unavailable in execution runtime
      })
    } catch {
      // Non-fatal
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

    // `dailySendLimit` is surfaced from `system_settings.email_daily_send_limit` —
    // the key the queue processor's quota gate actually reads. This section used to
    // persist its own `email_settings.dailySendLimit` that no runtime code consumed,
    // so an admin lowering the limit here changed nothing.
    let effectiveDailyLimit = settings.dailySendLimit
    try {
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'email_daily_send_limit')
        .maybeSingle()
      const limit = Number((data as { value?: { limit?: unknown } } | null)?.value?.limit)
      if (Number.isFinite(limit) && limit > 0) effectiveDailyLimit = limit
    } catch {
      // Fall back to the stored section value if the runtime key is unreadable.
    }

    return {
      ...settings,
      dailySendLimit: effectiveDailyLimit,
      resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    }
  }

  public static async getNotificationSettings(): Promise<NotificationSettings> {
    return this.getSettings<NotificationSettings>('notifications')
  }

  public static async getOnboardingSettings(): Promise<OnboardingSettings> {
    const settings = await this.getSettings<OnboardingSettings>('onboarding')

    // Ensure all 4 canonical steps exist and are valid. If legacy (<4 steps) or invalid step config exists in DB, use defaults:
    const hasValid4Steps =
      Array.isArray(settings.steps) &&
      settings.steps.length === 4 &&
      settings.steps.every((s) => s && s.id && typeof s.title === 'string')

    const steps = hasValid4Steps ? settings.steps : DEFAULT_ONBOARDING_STEPS

    const fieldOptions = {
      ...settings.fieldOptions,
      goal:
        settings.fieldOptions?.goal && settings.fieldOptions.goal.length > 0
          ? settings.fieldOptions.goal
          : DEFAULT_GOAL_OPTIONS,
      experience_level:
        settings.fieldOptions?.experience_level && settings.fieldOptions.experience_level.length > 0
          ? settings.fieldOptions.experience_level
          : DEFAULT_EXPERIENCE_OPTIONS,
      topics:
        settings.fieldOptions?.topics && settings.fieldOptions.topics.length > 0
          ? settings.fieldOptions.topics
          : DEFAULT_TOPIC_OPTIONS,
      learning_preference:
        settings.fieldOptions?.learning_preference && settings.fieldOptions.learning_preference.length > 0
          ? settings.fieldOptions.learning_preference
          : DEFAULT_PREFERENCE_OPTIONS,
    }

    return {
      ...settings,
      steps,
      fieldOptions,
    }
  }

  public static async getFeatureFlags(): Promise<FeatureFlagRecord[]> {
    // Previously returned the in-memory map without reading the database, so the
    // Settings workspace showed DEFAULT_FEATURE_FLAGS on any cold instance and a
    // saved toggle appeared to revert on the next page load.
    await globalFeatureFlagService.ensureHydrated()
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

    // Write `dailySendLimit` through to the key the send pipeline enforces, so this
    // control and the Communications workspace's daily limit stay one value rather
    // than two that silently diverge.
    if (typeof allowed.dailySendLimit === 'number' && Number.isFinite(allowed.dailySendLimit)) {
      const limitVal = Math.max(10, Math.min(1000, Math.trunc(allowed.dailySendLimit)))
      updated.dailySendLimit = limitVal
      try {
        const supabase = createServiceRoleClient()
        await supabase
          .from('system_settings')
          .upsert({ key: 'email_daily_send_limit', value: { limit: limitVal }, updated_at: new Date().toISOString() })
      } catch (err) {
        console.warn('[SettingsService] Failed to propagate dailySendLimit to email_daily_send_limit:', err)
      }
    }

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