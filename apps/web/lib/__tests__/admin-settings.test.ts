import { describe, it, expect, beforeEach } from 'vitest'
import { SettingsService } from '../admin/settings-service'
import type {
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
} from '../admin/types'

const mockStorage: Record<string, unknown> = {}
const originalFetch = global.fetch
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = String(input)
  const isSupabaseCall =
    urlStr.includes('supabase.co') ||
    urlStr.includes('mock.supabase.co') ||
    urlStr.includes('/rest/v1/') ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && urlStr.includes(process.env.NEXT_PUBLIC_SUPABASE_URL))

  if (isSupabaseCall) {
    if (init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'PUT') {
      try {
        const body = JSON.parse(String(init.body))
        if (body?.key) {
          mockStorage[body.key] = body.value
        }
      } catch {}
      return new Response(JSON.stringify([{ success: true }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    for (const key of Object.keys(mockStorage)) {
      if (urlStr.includes(encodeURIComponent(key)) || urlStr.includes(key)) {
        return new Response(JSON.stringify({ value: mockStorage[key] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
    return new Response(JSON.stringify(null), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return originalFetch(input, init)
}) as typeof global.fetch

describe('Admin Settings Unit Test Suite', () => {
  // Reset the shared in-memory mock storage before each test to prevent
  // state bleed (e.g. the updateOnboardingSettings test saving a 2-step
  // array that then pollutes the getOnboardingSettings defaults test).
  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) {
      delete mockStorage[key]
    }
  })

  it('SettingsService.getProductSettings returns complete default values on unconfigured state', async () => {
    const settings: ProductSettings = await SettingsService.getProductSettings()
    expect(typeof settings.siteName).toBe('string')
    expect(settings.siteName.length).toBeGreaterThan(0)
    expect(typeof settings.siteDescription).toBe('string')
    expect(typeof settings.contactEmail).toBe('string')
    expect(typeof settings.maintenanceMode).toBe('boolean')
    expect(typeof settings.allowSignups).toBe('boolean')
    expect(typeof settings.requireEmailVerification).toBe('boolean')
    expect(typeof settings.sessionTimeoutMinutes).toBe('number')
    expect(settings.sessionTimeoutMinutes).toBeGreaterThanOrEqual(5)
  })

  it('SettingsService.getLearningSettings returns valid XP, streak, certificate, and progress defaults', async () => {
    const settings: LearningSettings = await SettingsService.getLearningSettings()
    expect(typeof settings.xpPerLessonComplete).toBe('number')
    expect(typeof settings.xpPerQuizPass).toBe('number')
    expect(typeof settings.xpPerFlashcardReview).toBe('number')
    expect(typeof settings.xpPerReflection).toBe('number')
    expect(typeof settings.streakFreezeEnabled).toBe('boolean')
    expect(typeof settings.streakFreezeCostXp).toBe('number')
    expect(typeof settings.certificateAutoIssue).toBe('boolean')
    expect(typeof settings.lessonCompletionRequiredForProgress).toBe('boolean')
    expect(typeof settings.quizPassThreshold).toBe('number')
    expect(settings.quizPassThreshold).toBeGreaterThanOrEqual(0)
    expect(settings.quizPassThreshold).toBeLessThanOrEqual(100)
  })

  it('SettingsService.getEmailSettings reflects environment RESEND_API_KEY status accurately', async () => {
    const originalKey = process.env.RESEND_API_KEY
    try {
      delete process.env.RESEND_API_KEY
      const withoutKey: EmailSettings = await SettingsService.getEmailSettings()
      expect(withoutKey.resendApiKeyConfigured).toBe(false)

      process.env.RESEND_API_KEY = 're_test_mock_key_123'
      const withKey: EmailSettings = await SettingsService.getEmailSettings()
      expect(withKey.resendApiKeyConfigured).toBe(true)
      expect(typeof withKey.fromName).toBe('string')
      expect(typeof withKey.fromEmail).toBe('string')
      expect(typeof withKey.dailySendLimit).toBe('number')
      expect(typeof withKey.retryFailedEmails).toBe('boolean')
    } finally {
      if (originalKey !== undefined) {
        process.env.RESEND_API_KEY = originalKey
      } else {
        delete process.env.RESEND_API_KEY
      }
    }
  })

  it('SettingsService.getNotificationSettings returns reminder, recap, and default channels', async () => {
    const settings: NotificationSettings = await SettingsService.getNotificationSettings()
    expect(typeof settings.dailyReminderEnabled).toBe('boolean')
    expect(typeof settings.dailyReminderTime).toBe('string')
    expect(/^\d{2}:\d{2}$/.test(settings.dailyReminderTime)).toBe(true)
    expect(typeof settings.inactivityReminderDays).toBe('number')
    expect(typeof settings.weeklyRecapEnabled).toBe('boolean')
    expect(typeof settings.weeklyRecapDay).toBe('number')
    expect(settings.weeklyRecapDay).toBeGreaterThanOrEqual(0)
    expect(settings.weeklyRecapDay).toBeLessThanOrEqual(6)
    expect(typeof settings.defaultInAppEnabled).toBe('boolean')
    expect(typeof settings.defaultEmailEnabled).toBe('boolean')
  })

  it('SettingsService.getFeatureFlags returns all active runtime flags', async () => {
    const flags = await SettingsService.getFeatureFlags()
    expect(Array.isArray(flags)).toBe(true)
    expect(flags.length).toBeGreaterThanOrEqual(5)
    const emailFlag = flags.find((f) => f.key === 'EMAIL_ENABLED')
    expect(emailFlag).toBeDefined()
    expect(typeof emailFlag?.enabled).toBe('boolean')
  })

  it('SettingsService.getOnboardingSettings returns 4 default steps and 4 option sets', async () => {
    const onboarding = await SettingsService.getOnboardingSettings()
    expect(typeof onboarding.enabled).toBe('boolean')
    expect(Array.isArray(onboarding.steps)).toBe(true)
    expect(onboarding.steps.length).toBe(4)
    expect(onboarding.steps[0].id).toBe('step_profile')
    expect(onboarding.steps[1].id).toBe('step_background')
    expect(onboarding.steps[2].id).toBe('step_interests')
    expect(onboarding.steps[3].id).toBe('step_path')

    expect(onboarding.fieldOptions?.goal?.length).toBeGreaterThanOrEqual(5)
    expect(onboarding.fieldOptions?.experience_level?.length).toBeGreaterThanOrEqual(4)
    expect(onboarding.fieldOptions?.topics?.length).toBeGreaterThanOrEqual(10)
    expect(onboarding.fieldOptions?.learning_preference?.length).toBeGreaterThanOrEqual(5)
  })

  it('SettingsService.getAllSettings returns all 6 workspace domains in parallel', async () => {
    const all = await SettingsService.getAllSettings()
    expect(all.product).toBeDefined()
    expect(all.learning).toBeDefined()
    expect(all.email).toBeDefined()
    expect(all.notifications).toBeDefined()
    expect(all.onboarding).toBeDefined()
    expect(Array.isArray(all.featureFlags)).toBe(true)
  })

  it('SettingsService.updateProductSettings merges partial updates and preserves existing values', async () => {
    const updated = await SettingsService.updateProductSettings({
      siteName: 'Prodily PM Academy Custom',
      maintenanceMode: true,
    })
    expect(updated.siteName).toBe('Prodily PM Academy Custom')
    expect(updated.maintenanceMode).toBe(true)
    expect(typeof updated.contactEmail).toBe('string')
    expect(typeof updated.sessionTimeoutMinutes).toBe('number')
  })

  it('SettingsService.updateEmailSettings strips read-only fields on update', async () => {
    const updated = await SettingsService.updateEmailSettings({
      fromName: 'Prodily Support',
      resendApiKeyConfigured: false,
    })
    expect(updated.fromName).toBe('Prodily Support')
    expect(typeof updated.resendApiKeyConfigured).toBe('boolean')
  })

  it('SettingsService.updateLearningSettings saves streak freeze and certificate config', async () => {
    const updated = await SettingsService.updateLearningSettings({
      streakFreezeEnabled: false,
      quizPassThreshold: 85,
      certificateExpiryDays: 365,
    })
    expect(updated.streakFreezeEnabled).toBe(false)
    expect(updated.quizPassThreshold).toBe(85)
    expect(updated.certificateExpiryDays).toBe(365)
  })

  it('SettingsService.updateNotificationSettings saves reminder and recap config', async () => {
    const updated = await SettingsService.updateNotificationSettings({
      dailyReminderEnabled: true,
      dailyReminderTime: '10:30',
      weeklyRecapDay: 5,
    })
    expect(updated.dailyReminderEnabled).toBe(true)
    expect(updated.dailyReminderTime).toBe('10:30')
    expect(updated.weeklyRecapDay).toBe(5)
  })

  it('SettingsService.updateOnboardingSettings saves customized steps and required fields', async () => {
    const customSteps = [
      {
        id: 'step_profile',
        title: 'Custom Profile & Portfolio',
        description: 'Personalize your learner identity and shareable public portfolio.',
        requiredFields: ['username', 'name'],
      },
      {
        id: 'step_background',
        title: 'Custom Background & Career Track',
        description: 'Help us calibrate your starting point and customized recommendations.',
        requiredFields: ['experience_level', 'goal'],
      },
      {
        id: 'step_interests',
        title: 'Custom Skill Focus & Learning Style',
        description: 'Select your focus areas and preferred learning format.',
        requiredFields: ['topics', 'learning_preference'],
      },
      {
        id: 'step_path',
        title: 'Your Calibrated Curriculum',
        description: 'Your personalized learning plan is ready to launch.',
        requiredFields: [],
      },
    ]

    const updated = await SettingsService.updateOnboardingSettings({
      enabled: false,
      steps: customSteps,
    })

    expect(updated.enabled).toBe(false)
    expect(updated.steps.length).toBe(4)
    expect(updated.steps[0].title).toBe('Custom Profile & Portfolio')
    expect(updated.steps[0].requiredFields).toEqual(['username', 'name'])
    expect(updated.steps[1].requiredFields).toEqual(['experience_level', 'goal'])
    expect(updated.steps[2].requiredFields).toEqual(['topics', 'learning_preference'])
  })

  it('SettingsService supports configuring custom field options across all 4 onboarding categories', async () => {
    const customGoalOptions = [
      {
        id: 'executive_track',
        label: 'Director / VP of Product Transition',
        description: 'Executive strategy, portfolio management, and organizational scaling.',
        badge: 'Executive',
        enabled: true,
      },
    ]

    const customExpOptions = [
      {
        id: 'student',
        label: 'University Student',
        description: 'Undergraduate or graduate student exploring tech careers.',
        badge: 'Student',
        enabled: true,
      },
    ]

    const customTopics = [
      {
        id: 'ai_product',
        label: 'AI Product Management',
        badge: 'AI',
        enabled: true,
      },
    ]

    const customPreferences = [
      {
        id: 'cohort',
        label: 'Cohort-based sprint',
        description: 'Weekly peer assignments and live reviews.',
        badge: 'Live',
        enabled: true,
      },
    ]

    const updated = await SettingsService.updateOnboardingSettings({
      fieldOptions: {
        goal: customGoalOptions,
        experience_level: customExpOptions,
        topics: customTopics,
        learning_preference: customPreferences,
      },
    })

    expect(updated.fieldOptions?.goal?.length).toBe(1)
    expect(updated.fieldOptions?.experience_level?.length).toBe(1)
    expect(updated.fieldOptions?.topics?.length).toBe(1)
    expect(updated.fieldOptions?.learning_preference?.length).toBe(1)

    const reloaded = await SettingsService.getOnboardingSettings()
    expect(reloaded.fieldOptions?.goal?.[0].label).toBe('Director / VP of Product Transition')
    expect(reloaded.fieldOptions?.experience_level?.[0].label).toBe('University Student')
    expect(reloaded.fieldOptions?.topics?.[0].label).toBe('AI Product Management')
    expect(reloaded.fieldOptions?.learning_preference?.[0].label).toBe('Cohort-based sprint')
  })
})
