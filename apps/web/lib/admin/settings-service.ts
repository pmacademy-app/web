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
import { normalizeReferralRewardXp, REFERRAL_REWARD_XP } from '../referral/reward'
import {
  XP_SETTINGS_VERSION,
  XP_VALUES,
  getRuntimeXpValues,
  invalidateRuntimeXpCache,
  readRuntimeXpValuesStrict,
  type XpValuesConfig,
} from '../xp/xp'

/** Upper bound for any admin XP setting; anything above keeps the current value. */
const MAX_XP_SETTING = 10_000

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

/** Admin XP fields from runtime XP values (the inverse of resolveXpValues in lib/xp/xp.ts). */
export function xpFieldsFromRuntime(xp: XpValuesConfig): Pick<
  LearningSettings,
  | 'xpPerLessonComplete'
  | 'xpPerQuizPass'
  | 'xpPerFlashcardReview'
  | 'xpPerReflection'
  | 'xpReferralReward'
  | 'xpQuizPerfectBonus'
  | 'xpPerCapstoneSubmitted'
  | 'xpStreakBaseReward'
> {
  return {
    xpPerLessonComplete: xp.THEORY_READ,
    xpPerQuizPass: xp.QUIZ_CORRECT,
    xpPerFlashcardReview: xp.FLASHCARD_REVIEW,
    xpPerReflection: xp.REFLECTION_SUBMITTED,
    xpReferralReward: xp.REFERRAL_ACTIVATION,
    xpQuizPerfectBonus: xp.QUIZ_PERFECT_BONUS,
    xpPerCapstoneSubmitted: xp.CAPSTONE_SUBMITTED,
    xpStreakBaseReward: xp.DAILY_STREAK_BASE,
  }
}

/**
 * The XP fields the runtime reads from the admin record only once it is versioned (lib/xp/xp.ts).
 * The referral reward is not one of them: it was always read from this record, on any build.
 */
const VERSION_GATED_XP_FIELDS = [
  'xpPerLessonComplete',
  'xpPerQuizPass',
  'xpPerFlashcardReview',
  'xpPerReflection',
  'xpQuizPerfectBonus',
  'xpPerCapstoneSubmitted',
  'xpStreakBaseReward',
] as const satisfies ReadonlyArray<keyof LearningSettings>

// XP defaults ARE the live defaults (XP_VALUES): saving the form unchanged changes nobody's XP.
// (They used to be 50/100/10/25, which never applied because the runtime read another key.)
export const DEFAULT_LEARNING_SETTINGS: LearningSettings = {
  ...xpFieldsFromRuntime(XP_VALUES),
  xpReferralReward: REFERRAL_REWARD_XP,
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
} from './onboarding-defaults'

// Moved to `./onboarding-defaults` (client-safe) and re-exported so existing
// server call sites are unchanged. A browser consumer must import them from
// that module directly — importing them from here pulls this service, the
// service-role client and the system_settings query code into the bundle.
// `DEFAULT_TOPIC_OPTIONS` / `DEFAULT_PREFERENCE_OPTIONS` are the reference taxonomy
// for existing learners' onboarding attributes (Phase 4C); they are no longer part
// of the live single-screen onboarding config but remain re-exported for consumers
// such as `lib/personalization/path-resolver.ts`.
export {
  DEFAULT_GOAL_OPTIONS,
  DEFAULT_EXPERIENCE_OPTIONS,
  DEFAULT_TOPIC_OPTIONS,
  DEFAULT_PREFERENCE_OPTIONS,
} from './onboarding-defaults'


// Phase 4C: the live onboarding is a single screen collecting goal + experience only,
// so the configurable settings model exposes exactly those two option groups.
const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
  enabled: true,
  fieldOptions: {
    goal: DEFAULT_GOAL_OPTIONS,
    experience_level: DEFAULT_EXPERIENCE_OPTIONS,
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

/** A settings section could not be read. Not the same as "no record yet", which reads as the defaults. */
export class SettingsReadError extends Error {
  constructor(public readonly section: SettingsSectionKey) {
    super(`Could not read the current ${section} settings`)
    this.name = 'SettingsReadError'
  }
}

/**
 * `strict` is for the admin settings screen and the update functions: a failed read throws
 * SettingsReadError instead of returning defaults, which a save would then write over the real
 * record. Runtime readers leave it off and keep getting defaults when the database is unreachable.
 */
export interface SettingsReadOptions {
  strict?: boolean
}

const STRICT: SettingsReadOptions = { strict: true }

/** What the admin settings screen loads: every section, and which of them could not be read. */
export interface AdminWorkspaceSettings {
  data: {
    product: ProductSettings
    learning: LearningSettings
    email: EmailSettings
    notifications: NotificationSettings
    onboarding: OnboardingSettings
    'feature-flags': FeatureFlagRecord[]
  }
  /** Sections whose `data` is placeholder defaults: never show them as an editable form. */
  failedSections: SettingsSectionKey[]
}

export class SettingsService {
  private static sectionCache = new Map<string, { value: unknown; timestamp: number }>()
  private static readonly CACHE_TTL_MS = 60_000 // 60 seconds L1 in-memory TTL

  /**
   * Generic fetch for a settings section with in-memory caching.
   * Returns defaults if no record exists. On a read error it returns defaults too (uncached),
   * unless `strict`, which throws SettingsReadError.
   */
  private static async getSettings<T>(section: SettingsSectionKey, { strict = false }: SettingsReadOptions = {}): Promise<T> {
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
      if (strict) throw new SettingsReadError(section)
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
      type DBChain = { upsert: (row: unknown) => Promise<{ error: { message?: string } | null }> }
      const { error } = await (supabase.from('system_settings') as unknown as DBChain).upsert({
        key,
        value,
        updated_at: new Date().toISOString(),
      })
      // supabase-js returns a failed write instead of throwing it.
      if (error) throw new Error(error.message || 'upsert failed')
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

  public static async getProductSettings(options: SettingsReadOptions = {}): Promise<ProductSettings> {
    return this.getSettings<ProductSettings>('product', options)
  }

  /**
   * Learning settings as they are in effect. A record not yet saved by the reconciled form
   * (xpSettingsVersion !== 2) never drove runtime XP, so its XP numbers are replaced by the values
   * actually in effect: the admin sees, and a first save keeps, what learners really earn.
   * Every read carries `xpFormVersion`, which the form echoes back on save (see updateLearningSettings).
   */
  public static async getLearningSettings(options: SettingsReadOptions = {}): Promise<LearningSettings> {
    const settings = await this.getSettings<LearningSettings>('learning', options)
    if (settings.xpSettingsVersion === XP_SETTINGS_VERSION) {
      return { ...settings, xpFormVersion: XP_SETTINGS_VERSION }
    }
    let live: XpValuesConfig = XP_VALUES
    if (options.strict) {
      // getRuntimeXpValues never fails: on a read error it answers with the last good values or the
      // static defaults. Shown as "live" with a valid xpFormVersion, those would be stamped version
      // 2 by the next save, over whatever the legacy record really holds. So read them for real.
      try {
        live = await readRuntimeXpValuesStrict(createServiceRoleClient())
      } catch (err) {
        console.warn('[SettingsService] getLearningSettings: live XP values could not be read:', err)
        throw new SettingsReadError('learning')
      }
    } else {
      try {
        // The runtime's own 30s cache: this runs on dashboard loads.
        live = await getRuntimeXpValues(createServiceRoleClient())
      } catch {
        // No database client (e.g. env not configured): the static defaults are what is in effect.
      }
    }
    // The referral reward is the exception: the stored value is honoured rather than replaced.
    // Before Growth R5 the referral service paid a constant (50) and this field did not exist;
    // since then it resolves the reward from this record whatever its version. That is safe: an
    // older record has no value (so the default, 50, applies) unless an admin has since set "XP
    // per Referral" on purpose, and an unusable value falls back to 50 at award time
    // (normalizeReferralRewardXp).
    const { xpReferralReward: _referralFromRuntime, ...liveXp } = xpFieldsFromRuntime(live)
    void _referralFromRuntime
    return { ...settings, ...liveXp, xpFormVersion: XP_SETTINGS_VERSION }
  }

  public static async getEmailSettings(options: SettingsReadOptions = {}): Promise<EmailSettings> {
    const settings = await this.getSettings<EmailSettings>('email', options)

    // `dailySendLimit` is surfaced from `system_settings.email_daily_send_limit` —
    // the key the queue processor's quota gate actually reads. This section used to
    // persist its own `email_settings.dailySendLimit` that no runtime code consumed,
    // so an admin lowering the limit here changed nothing.
    let effectiveDailyLimit = settings.dailySendLimit
    try {
      const supabase = createServiceRoleClient()
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'email_daily_send_limit')
        .maybeSingle()
      if (error) throw new Error(error.message)
      const limit = Number((data as { value?: { limit?: unknown } } | null)?.value?.limit)
      if (Number.isFinite(limit) && limit > 0) effectiveDailyLimit = limit
    } catch {
      // Fall back to the stored section value if the runtime key is unreadable. Not for the admin
      // form: saving it would write that stale number through to the enforced key.
      if (options.strict) throw new SettingsReadError('email')
    }

    return {
      ...settings,
      dailySendLimit: effectiveDailyLimit,
      resendApiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    }
  }

  public static async getNotificationSettings(options: SettingsReadOptions = {}): Promise<NotificationSettings> {
    return this.getSettings<NotificationSettings>('notifications', options)
  }

  public static async getOnboardingSettings(options: SettingsReadOptions = {}): Promise<OnboardingSettings> {
    const settings = await this.getSettings<OnboardingSettings>('onboarding', options)

    // Phase 4C: the single-screen onboarding consumes only the goal and experience option
    // lists. Fall back to the defaults when a group is missing or empty. Any legacy option
    // groups still present in stored JSON (e.g. topics / learning_preference from the old
    // 4-step model) are preserved as-is but no longer surfaced by the Admin UI or the wizard.
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
    }

    return {
      ...settings,
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
    // Strict here and in every update below: never merge the change over defaults standing in for a
    // record that could not be read.
    const current = await this.getProductSettings(STRICT)
    const updated = { ...current, ...partial }
    return this.upsertSettings('product', updated)
  }

  public static async updateLearningSettings(
    partial: Partial<LearningSettings>
  ): Promise<LearningSettings> {
    const { xpFormVersion: _currentFormVersion, ...current } = await this.getLearningSettings(STRICT)
    void _currentFormVersion
    // Neither marker is taken from the body: the form version is a per-request proof and is never
    // stored, and the stored version is only ever set below.
    const { xpFormVersion, xpSettingsVersion: _bodySettingsVersion, ...body } = partial
    void _bodySettingsVersion
    // A form loaded before the reconciliation (an admin tab left open across the deploy, or an old
    // instance during a rolling one) still holds the old inert defaults (50/100/10/25) and PATCHes
    // the whole section. Its XP numbers are dropped; the rest of what it sent still saves.
    const fromReconciledForm = xpFormVersion === XP_SETTINGS_VERSION
    if (!fromReconciledForm) {
      for (const field of VERSION_GATED_XP_FIELDS) delete body[field]
    }
    const updated: LearningSettings = { ...current, ...body }
    // Store only values the runtime will actually use: an invalid number keeps the current one
    // instead of being silently replaced by a default at award time.
    const positive = (value: unknown, fallback: number) =>
      typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= MAX_XP_SETTING ? value : fallback
    updated.xpPerLessonComplete = positive(updated.xpPerLessonComplete, current.xpPerLessonComplete)
    updated.xpPerQuizPass = positive(updated.xpPerQuizPass, current.xpPerQuizPass)
    updated.xpPerFlashcardReview = positive(updated.xpPerFlashcardReview, current.xpPerFlashcardReview)
    updated.xpPerReflection = positive(updated.xpPerReflection, current.xpPerReflection)
    updated.xpPerCapstoneSubmitted = positive(updated.xpPerCapstoneSubmitted, current.xpPerCapstoneSubmitted)
    updated.xpStreakBaseReward = positive(updated.xpStreakBaseReward, current.xpStreakBaseReward)
    updated.xpQuizPerfectBonus =
      typeof updated.xpQuizPerfectBonus === 'number' &&
      Number.isInteger(updated.xpQuizPerfectBonus) &&
      updated.xpQuizPerfectBonus >= 0 &&
      updated.xpQuizPerfectBonus <= MAX_XP_SETTING
        ? updated.xpQuizPerfectBonus
        : current.xpQuizPerfectBonus
    // Same rule for the referral reward (the default only when the current value is itself unusable).
    updated.xpReferralReward =
      normalizeReferralRewardXp(updated.xpReferralReward) === updated.xpReferralReward
        ? updated.xpReferralReward
        : normalizeReferralRewardXp(current.xpReferralReward)
    // From now on this record drives runtime XP (lib/xp/xp.ts). An older form does not make that
    // switch: the record keeps whichever version it had, so live XP stays exactly as it was.
    if (fromReconciledForm) updated.xpSettingsVersion = XP_SETTINGS_VERSION
    const saved = await this.upsertSettings('learning', updated)
    // This instance picks the change up at once; others within their 30s runtime cache.
    invalidateRuntimeXpCache()
    return { ...saved, xpFormVersion: XP_SETTINGS_VERSION }
  }

  public static async updateEmailSettings(
    partial: Partial<EmailSettings>
  ): Promise<EmailSettings> {
    const current = await this.getEmailSettings(STRICT)
    // Don't allow overwriting read-only field
    const allowed = { ...partial }
    delete (allowed as { resendApiKeyConfigured?: boolean }).resendApiKeyConfigured
    const updated = { ...current, ...allowed }

    // Write `dailySendLimit` through to the key the send pipeline enforces, so this
    // control and the Communications workspace's daily limit stay one value rather
    // than two that silently diverge.
    const limitVal =
      typeof allowed.dailySendLimit === 'number' && Number.isFinite(allowed.dailySendLimit)
        ? Math.max(10, Math.min(1000, Math.trunc(allowed.dailySendLimit)))
        : null
    if (limitVal !== null) updated.dailySendLimit = limitVal

    // The section first: if it fails, "Failed to save" is true and the enforced limit is untouched.
    const saved = await this.upsertSettings('email', updated)

    if (limitVal !== null) {
      try {
        const supabase = createServiceRoleClient()
        const { error } = await supabase
          .from('system_settings')
          .upsert({ key: 'email_daily_send_limit', value: { limit: limitVal }, updated_at: new Date().toISOString() })
        if (error) throw new Error(error.message)
      } catch (err) {
        // The section is saved but the enforced limit did not change: say exactly that. Reads
        // surface the enforced key, so the form shows the limit still in force after a reload.
        console.warn('[SettingsService] Failed to propagate dailySendLimit to email_daily_send_limit:', err)
        throw new Error(
          'Email settings were saved, but the daily send limit was not applied: the previous limit is still enforced. Save again to retry.'
        )
      }
    }

    return saved
  }

  public static async updateNotificationSettings(
    partial: Partial<NotificationSettings>
  ): Promise<NotificationSettings> {
    const current = await this.getNotificationSettings(STRICT)
    const updated = { ...current, ...partial }
    return this.upsertSettings('notifications', updated)
  }

  public static async updateOnboardingSettings(
    partial: Partial<OnboardingSettings>
  ): Promise<OnboardingSettings> {
    const current = await this.getOnboardingSettings(STRICT)
    const updated = { ...current, ...partial }
    return this.upsertSettings('onboarding', updated)
  }

  /**
   * Get all settings at once.
   */
  public static async getAllSettings(options: SettingsReadOptions = {}): Promise<{
    product: ProductSettings
    learning: LearningSettings
    email: EmailSettings
    notifications: NotificationSettings
    onboarding: OnboardingSettings
    featureFlags: FeatureFlagRecord[]
  }> {
    const [product, learning, email, notifications, onboarding, featureFlags] = await Promise.all([
      this.getProductSettings(options),
      this.getLearningSettings(options),
      this.getEmailSettings(options),
      this.getNotificationSettings(options),
      this.getOnboardingSettings(options),
      this.getFeatureFlags(),
    ])
    return { product, learning, email, notifications, onboarding, featureFlags }
  }

  /**
   * Everything the admin settings screen needs. A section that could not be read is listed in
   * `failedSections` and carries placeholder defaults, so the screen can show an error for it
   * instead of a form whose save would overwrite the real record.
   */
  public static async getAdminWorkspaceSettings(): Promise<AdminWorkspaceSettings> {
    const failedSections: SettingsSectionKey[] = []
    const orFailed = <T>(section: SettingsSectionKey, read: Promise<T>): Promise<T> =>
      read.catch(() => {
        failedSections.push(section)
        return getDefaultSettings<T>(section)
      })
    const [product, learning, email, notifications, onboarding, featureFlags] = await Promise.all([
      orFailed('product', this.getProductSettings(STRICT)),
      orFailed('learning', this.getLearningSettings(STRICT)),
      orFailed('email', this.getEmailSettings(STRICT)),
      // Nothing on the screen edits this section (it points to Communications), so it stays tolerant.
      this.getNotificationSettings(),
      orFailed('onboarding', this.getOnboardingSettings(STRICT)),
      this.getFeatureFlags(),
    ])
    return {
      data: { product, learning, email, notifications, onboarding, 'feature-flags': featureFlags },
      failedSections,
    }
  }
}