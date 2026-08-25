import { createServiceRoleClient } from '../supabase'
import { globalFeatureFlagService } from '../notifications/feature-flags/service'
import type {
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
  OnboardingSettings,
  OnboardingStepConfig,
  OnboardingFieldOption,
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

export const DEFAULT_GOAL_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'become_pm',
    label: 'Become a Product Manager',
    description: 'Build core product thinking and mental models to land your first PM role.',
    badge: 'Aspiring PM',
    icon: 'Target',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'transition_pm',
    label: 'Transition into Product Management',
    description: 'Pivot from engineering, design, consulting, marketing, or operations into product.',
    badge: 'Career Pivot',
    icon: 'Compass',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'grow_career',
    label: 'Grow in my PM career',
    description: 'Sharpen advanced strategy, executive communication, and leadership capabilities.',
    badge: 'Skill Growth',
    icon: 'TrendingUp',
    enabled: true,
    recommendedModule: 'strategy',
  },
  {
    id: 'build_skills',
    label: 'Build practical PM skills',
    description: 'Master discovery, PRDs, metrics trees, and roadmapping through real capstones.',
    badge: 'Hands-on',
    icon: 'Sparkles',
    enabled: true,
    recommendedModule: 'discovery',
  },
  {
    id: 'explore_pm',
    label: 'Explore Product Management',
    description: 'Evaluate PM methodologies, frameworks, and career trajectories.',
    badge: 'Foundations',
    icon: 'BookOpen',
    enabled: true,
    recommendedModule: 'foundations',
  },
]

export const DEFAULT_EXPERIENCE_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Brand new to product management concepts and frameworks.',
    badge: 'Level 1',
    icon: 'Sparkles',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'learning',
    label: 'Learning Product Management',
    description: 'Actively studying PM articles, books, or preparing for APM/PM interviews.',
    badge: 'Level 2',
    icon: 'BookOpen',
    enabled: true,
    recommendedModule: 'foundations',
  },
  {
    id: 'working',
    label: 'Working in Product',
    description: 'Associate PM, junior PM, or adjacent role (engineer, designer, analyst) in a product team.',
    badge: 'Level 3',
    icon: 'Briefcase',
    enabled: true,
    recommendedModule: 'discovery',
  },
  {
    id: 'experienced',
    label: 'Experienced Product Manager',
    description: 'Mid to Senior PM looking to level up advanced craft, roadmapping, and leadership.',
    badge: 'Level 4',
    icon: 'Award',
    enabled: true,
    recommendedModule: 'strategy',
  },
]

export const DEFAULT_TOPIC_OPTIONS: OnboardingFieldOption[] = [
  { id: 'discovery', label: 'Product Discovery', badge: 'Discovery', icon: 'Search', enabled: true, recommendedModule: 'discovery' },
  { id: 'user_research', label: 'User Research', badge: 'Research', icon: 'Users', enabled: true, recommendedModule: 'discovery' },
  { id: 'strategy', label: 'Product Strategy', badge: 'Strategy', icon: 'Target', enabled: true, recommendedModule: 'strategy' },
  { id: 'roadmapping', label: 'Product Roadmapping', badge: 'Roadmap', icon: 'Map', enabled: true, recommendedModule: 'strategy' },
  { id: 'prioritization', label: 'Prioritization', badge: 'Decision', icon: 'Sliders', enabled: true, recommendedModule: 'strategy' },
  { id: 'metrics', label: 'Metrics & Analytics', badge: 'Analytics', icon: 'TrendingUp', enabled: true, recommendedModule: 'growth' },
  { id: 'prds', label: 'PRDs & Documentation', badge: 'Execution', icon: 'FileText', enabled: true, recommendedModule: 'execution' },
  { id: 'agile', label: 'Agile & Execution', badge: 'Delivery', icon: 'Zap', enabled: true, recommendedModule: 'execution' },
  { id: 'stakeholders', label: 'Stakeholder Management', badge: 'Leadership', icon: 'Users', enabled: true, recommendedModule: 'leadership' },
  { id: 'launch', label: 'Product Launch', badge: 'GTM', icon: 'Rocket', enabled: true, recommendedModule: 'growth' },
]

export const DEFAULT_PREFERENCE_OPTIONS: OnboardingFieldOption[] = [
  {
    id: 'structured',
    label: 'Structured learning',
    description: 'Follow the progressive 90-lesson curriculum step-by-step from Module 1 to 9.',
    badge: 'Sequential',
    icon: 'ListOrdered',
    enabled: true,
  },
  {
    id: 'hands_on',
    label: 'Hands-on practice',
    description: 'Focus on portfolio capstones, interactive simulations, and real-world exercises.',
    badge: 'Practical',
    icon: 'Hammer',
    enabled: true,
  },
  {
    id: 'case_studies',
    label: 'Case studies',
    description: 'Analyze real teardowns from Stripe, Airbnb, Spotify, Linear, and Notion.',
    badge: 'Analysis',
    icon: 'FileSpreadsheet',
    enabled: true,
  },
  {
    id: 'quick_lessons',
    label: 'Quick lessons',
    description: 'Bite-sized theory with flashcard spaced repetition for rapid retention.',
    badge: 'Micro-learning',
    icon: 'Zap',
    enabled: true,
  },
  {
    id: 'mix',
    label: 'A mix of everything',
    description: 'Balanced approach blending theory, case studies, quizzes, and capstones.',
    badge: 'Comprehensive',
    icon: 'Sparkles',
    enabled: true,
  },
]

export const DEFAULT_ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'step_profile',
    title: 'Build Your Profile',
    description: 'Personalize your learner identity and shareable public portfolio.',
    requiredFields: ['username', 'name'],
  },
  {
    id: 'step_background',
    title: 'Tell Us About You',
    description: 'Help us calibrate your starting point and customized recommendations.',
    requiredFields: ['experience_level', 'goal'],
  },
  {
    id: 'step_interests',
    title: 'Choose What You Want to Learn',
    description: 'Select your focus areas and preferred learning format.',
    requiredFields: ['topics', 'learning_preference'],
  },
  {
    id: 'step_path',
    title: 'Your Prodily Path',
    description: 'Your personalized learning plan is ready to launch.',
    requiredFields: [],
  },
]

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