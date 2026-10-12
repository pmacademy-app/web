import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { SettingsReadError, SettingsService } from '../admin/settings-service'
import { resolveReferralRewardXp } from '../referral/referral-service'
import { REFERRAL_REWARD_XP } from '../referral/reward'
import type {
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
} from '../admin/types'

const guard = vi.hoisted(() => ({ requireAdminUser: vi.fn(), logAdminAction: vi.fn() }))
vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => guard.requireAdminUser(req),
  logAdminAction: guard.logAdminAction,
}))

const mockStorage: Record<string, unknown> = {}
/** Failure switches for the database stand-in: every write, and reads of the listed keys (or all). */
const faults = {
  writes: false,
  /** Keys whose write fails while the others succeed. */
  writeKeys: [] as string[],
  reads: [] as string[] | 'all',
  writeCount: 0,
  /** The keys written, in order. */
  written: [] as string[],
}
const failed = () =>
  new Response(JSON.stringify({ message: 'database unavailable', code: '57P03' }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  })
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
      if (faults.writes) return failed()
      try {
        if (faults.writeKeys.includes(JSON.parse(String(init.body))?.key)) return failed()
      } catch {}
      faults.writeCount += 1
      try {
        const body = JSON.parse(String(init.body))
        if (body?.key) {
          faults.written.push(body.key)
          mockStorage[body.key] = body.value
        }
      } catch {}
      return new Response(JSON.stringify([{ success: true }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (faults.reads === 'all' || faults.reads.some((key) => urlStr.includes(`eq.${key}`))) return failed()
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

  // Phase 4C: the live onboarding is a single screen collecting goal + experience only,
  // so the settings model exposes exactly those two option groups (no steps, topics, or
  // learning-preference config).
  it('SettingsService.getOnboardingSettings returns the single-screen goal + experience option sets', async () => {
    const onboarding = await SettingsService.getOnboardingSettings()
    expect(typeof onboarding.enabled).toBe('boolean')

    // The 4-step model was removed — no configurable steps exist.
    expect((onboarding as { steps?: unknown }).steps).toBeUndefined()

    // 4 Experience Level options
    expect(onboarding.fieldOptions?.experience_level?.length).toBe(4)
    expect(onboarding.fieldOptions?.experience_level?.map((e) => e.label)).toEqual([
      'Beginner',
      'Learning Product Management',
      'Working in Product',
      'Experienced Product Manager',
    ])

    // 5 Primary Goal options
    expect(onboarding.fieldOptions?.goal?.length).toBe(5)
    expect(onboarding.fieldOptions?.goal?.map((g) => g.label)).toEqual([
      'Become a Product Manager',
      'Transition into Product Management',
      'Grow in my PM career',
      'Build practical PM skills',
      'Explore Product Management',
    ])

    // The deferred groups are not part of the live single-screen config.
    expect(onboarding.fieldOptions?.topics).toBeUndefined()
    expect(onboarding.fieldOptions?.learning_preference).toBeUndefined()
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

  it('SettingsService.updateOnboardingSettings toggles the onboarding screen on/off', async () => {
    const updated = await SettingsService.updateOnboardingSettings({ enabled: false })
    expect(updated.enabled).toBe(false)

    const reloaded = await SettingsService.getOnboardingSettings()
    expect(reloaded.enabled).toBe(false)
  })

  it('SettingsService supports configuring the goal and experience option groups', async () => {
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

    const updated = await SettingsService.updateOnboardingSettings({
      fieldOptions: {
        goal: customGoalOptions,
        experience_level: customExpOptions,
      },
    })

    expect(updated.fieldOptions?.goal?.length).toBe(1)
    expect(updated.fieldOptions?.experience_level?.length).toBe(1)

    const reloaded = await SettingsService.getOnboardingSettings()
    expect(reloaded.fieldOptions?.goal?.[0].label).toBe('Director / VP of Product Transition')
    expect(reloaded.fieldOptions?.experience_level?.[0].label).toBe('University Student')
  })
})

// A database error is not "no record yet". A failed write must not report success, and a failed
// read must not hand the admin form a page of defaults to save over the real record. Runtime
// readers are the exception: they keep getting defaults so a blip never takes the app down.
describe('settings when the database fails', () => {
  const patch = async (section: string, body: unknown) => {
    const { PATCH } = await import('../../app/api/admin/settings/route')
    return PATCH(
      new NextRequest(`https://prodily.app/api/admin/settings?section=${section}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({}) },
    )
  }

  beforeEach(() => {
    for (const key of Object.keys(mockStorage)) delete mockStorage[key]
    faults.writes = false
    faults.writeKeys = []
    faults.reads = []
    SettingsService.invalidateCache()
    faults.writeCount = 0
    faults.written = []
    guard.logAdminAction.mockReset()
    guard.requireAdminUser.mockReset().mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    faults.writes = false
    faults.writeKeys = []
    faults.reads = []
    vi.restoreAllMocks()
    SettingsService.invalidateCache()
  })

  describe('a failed write', () => {
    it('rejects for every section and leaves the caches alone', async () => {
      faults.writes = true
      const invalidate = vi.spyOn(SettingsService, 'invalidateCache')

      await expect(SettingsService.updateProductSettings({ maintenanceMode: true })).rejects.toThrow(/product settings/)
      await expect(SettingsService.updateLearningSettings({ quizPassThreshold: 85 })).rejects.toThrow(/learning settings/)
      await expect(SettingsService.updateEmailSettings({ fromName: 'X' })).rejects.toThrow(/email settings/)
      await expect(SettingsService.updateNotificationSettings({ weeklyRecapDay: 5 })).rejects.toThrow(/notifications settings/)
      await expect(SettingsService.updateOnboardingSettings({ enabled: false })).rejects.toThrow(/onboarding settings/)

      expect(invalidate).not.toHaveBeenCalled()
      expect(mockStorage).toEqual({})
    })

    it('rejects when the enforced daily send limit cannot be written', async () => {
      faults.writes = true
      await expect(SettingsService.updateEmailSettings({ dailySendLimit: 200 })).rejects.toThrow(/email settings/)
    })

    // The section is written first: a save reported as failed must not already have changed the
    // limit the send pipeline enforces.
    it('writes the email section before the enforced daily send limit', async () => {
      await SettingsService.updateEmailSettings({ dailySendLimit: 200 })

      expect(faults.written).toEqual(['email_settings', 'email_daily_send_limit'])
      expect(mockStorage.email_daily_send_limit).toEqual({ limit: 200 })
    })

    it('leaves the enforced daily send limit alone when the email section cannot be written', async () => {
      mockStorage.email_daily_send_limit = { limit: 500 }
      faults.writeKeys = ['email_settings']

      await expect(SettingsService.updateEmailSettings({ dailySendLimit: 200 })).rejects.toThrow('Failed to save email settings')

      expect(faults.written).toEqual([])
      expect(mockStorage.email_daily_send_limit).toEqual({ limit: 500 })
    })

    it('says the section saved but the limit did not when only the enforced key fails', async () => {
      mockStorage.email_daily_send_limit = { limit: 500 }
      faults.writeKeys = ['email_daily_send_limit']

      const save = SettingsService.updateEmailSettings({ fromName: 'Prodily Team', dailySendLimit: 200 })
      await expect(save).rejects.toThrow(/saved/i)
      await expect(save).rejects.toThrow(/daily send limit/i)

      expect(faults.written).toEqual(['email_settings'])
      expect((mockStorage.email_settings as EmailSettings).fromName).toBe('Prodily Team')
      // The limit in force, and the one the form shows on reload, is still the old one.
      expect(mockStorage.email_daily_send_limit).toEqual({ limit: 500 })
      expect((await SettingsService.getEmailSettings({ strict: true })).dailySendLimit).toBe(500)
    })

    it('is a failed request with no audit entry', async () => {
      faults.writes = true

      const res = await patch('product', { maintenanceMode: true })

      expect(res.status).toBe(500)
      expect((await res.json()).success).toBe(false)
      expect(guard.logAdminAction).not.toHaveBeenCalled()
    })

    it('a write that succeeds is still a 200 with an audit entry', async () => {
      const res = await patch('product', { maintenanceMode: true })

      expect(res.status).toBe(200)
      expect(guard.logAdminAction).toHaveBeenCalledTimes(1)
      expect((mockStorage.product_settings as ProductSettings).maintenanceMode).toBe(true)
    })
  })

  describe('a failed read', () => {
    it('is reported by a strict read instead of being replaced by defaults', async () => {
      faults.reads = 'all'

      await expect(SettingsService.getProductSettings({ strict: true })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.getLearningSettings({ strict: true })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.getEmailSettings({ strict: true })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.getOnboardingSettings({ strict: true })).rejects.toBeInstanceOf(SettingsReadError)
    })

    it('refuses to save over a record it could not read', async () => {
      mockStorage.product_settings = { siteName: 'Real name', allowSignups: false }
      mockStorage.learning_settings = { xpReferralReward: 120 }
      faults.reads = 'all'

      await expect(SettingsService.updateProductSettings({ siteDescription: 'x' })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.updateLearningSettings({ quizPassThreshold: 85 })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.updateEmailSettings({ fromName: 'X' })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.updateNotificationSettings({ weeklyRecapDay: 5 })).rejects.toBeInstanceOf(SettingsReadError)
      await expect(SettingsService.updateOnboardingSettings({ enabled: false })).rejects.toBeInstanceOf(SettingsReadError)

      expect(faults.writeCount).toBe(0)
      expect(mockStorage.product_settings).toEqual({ siteName: 'Real name', allowSignups: false })
      expect(mockStorage.learning_settings).toEqual({ xpReferralReward: 120 })
    })

    it('fails the save request without writing or logging', async () => {
      faults.reads = 'all'

      const res = await patch('product', { maintenanceMode: true })

      expect(res.status).toBe(500)
      expect((await res.json()).success).toBe(false)
      expect(faults.writeCount).toBe(0)
      expect(guard.logAdminAction).not.toHaveBeenCalled()
    })

    it('is not cached: the next read sees the real record', async () => {
      mockStorage.product_settings = { siteName: 'Real name' }
      faults.reads = 'all'
      expect((await SettingsService.getProductSettings()).siteName).toBe('Prodily')

      faults.reads = []
      expect((await SettingsService.getProductSettings()).siteName).toBe('Real name')
    })

    it('still gives runtime readers the defaults', async () => {
      mockStorage.product_settings = { requireEmailVerification: false }
      mockStorage.learning_settings = { xpReferralReward: 120 }
      faults.reads = 'all'

      const product = await SettingsService.getProductSettings()
      expect(product.siteName).toBe('Prodily')
      expect(product.maintenanceMode).toBe(false)
      await expect(SettingsService.isEmailVerificationRequired()).resolves.toBe(true)
      await expect(resolveReferralRewardXp()).resolves.toBe(REFERRAL_REWARD_XP)
      await expect(SettingsService.getEmailSettings()).resolves.toMatchObject({ fromName: 'Prodily' })
      await expect(SettingsService.getOnboardingSettings()).resolves.toMatchObject({ enabled: true })
    })

    it('marks only the unreadable sections for the settings page', async () => {
      mockStorage.learning_settings = { xpReferralReward: 120 }
      faults.reads = ['product_settings', 'onboarding_settings']

      const page = await SettingsService.getAdminWorkspaceSettings()

      expect([...page.failedSections].sort()).toEqual(['onboarding', 'product'])
      expect(page.data.learning.xpReferralReward).toBe(120)
      expect(Array.isArray(page.data['feature-flags'])).toBe(true)
    })
  })

  describe('a section that was never saved', () => {
    it('reads as defaults with nothing marked failed, and saves', async () => {
      const page = await SettingsService.getAdminWorkspaceSettings()
      expect(page.failedSections).toEqual([])
      expect(page.data.product.siteName).toBe('Prodily')
      await expect(SettingsService.getProductSettings({ strict: true })).resolves.toMatchObject({ allowSignups: true })

      const updated = await SettingsService.updateProductSettings({ maintenanceMode: true })

      expect(updated.maintenanceMode).toBe(true)
      expect(faults.writeCount).toBe(1)
      expect((mockStorage.product_settings as ProductSettings).maintenanceMode).toBe(true)
    })
  })
})
