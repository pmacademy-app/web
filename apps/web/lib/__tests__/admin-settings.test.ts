process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key'

import assert from 'node:assert'
import { SettingsService } from '../admin/settings-service'
import type {
  ProductSettings,
  LearningSettings,
  EmailSettings,
  NotificationSettings,
} from '../admin/types'

// Mock global fetch for instant unit test execution without waiting for network timeouts
const mockStorage: Record<string, unknown> = {}
const originalFetch = global.fetch
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const urlStr = String(input)
  if (urlStr.includes('mock.supabase.co')) {
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
    // GET
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

function runTest(name: string, fn: () => Promise<void> | void) {
  Promise.resolve(fn())
    .then(() => {
      console.log(`  ✓ ${name}`)
    })
    .catch((err) => {
      console.error(`  ✕ ${name}`)
      console.error(err)
      process.exit(1)
    })
}

console.log('🧪 Running Admin Settings Unit Test Suite...\n')

runTest('SettingsService.getProductSettings returns complete default values on unconfigured state', async () => {
  const settings: ProductSettings = await SettingsService.getProductSettings()
  assert.strictEqual(typeof settings.siteName, 'string')
  assert.ok(settings.siteName.length > 0)
  assert.strictEqual(typeof settings.siteDescription, 'string')
  assert.strictEqual(typeof settings.contactEmail, 'string')
  assert.strictEqual(typeof settings.maintenanceMode, 'boolean')
  assert.strictEqual(typeof settings.allowSignups, 'boolean')
  assert.strictEqual(typeof settings.requireEmailVerification, 'boolean')
  assert.strictEqual(typeof settings.sessionTimeoutMinutes, 'number')
  assert.ok(settings.sessionTimeoutMinutes >= 5)
})

runTest('SettingsService.getLearningSettings returns valid XP, streak, certificate, and progress defaults', async () => {
  const settings: LearningSettings = await SettingsService.getLearningSettings()
  assert.strictEqual(typeof settings.xpPerLessonComplete, 'number')
  assert.strictEqual(typeof settings.xpPerQuizPass, 'number')
  assert.strictEqual(typeof settings.xpPerFlashcardReview, 'number')
  assert.strictEqual(typeof settings.xpPerReflection, 'number')
  assert.strictEqual(typeof settings.streakFreezeEnabled, 'boolean')
  assert.strictEqual(typeof settings.streakFreezeCostXp, 'number')
  assert.strictEqual(typeof settings.certificateAutoIssue, 'boolean')
  assert.ok(settings.certificateExpiryDays === null || typeof settings.certificateExpiryDays === 'number')
  assert.strictEqual(typeof settings.lessonCompletionRequiredForProgress, 'boolean')
  assert.strictEqual(typeof settings.quizPassThreshold, 'number')
  assert.ok(settings.quizPassThreshold >= 0 && settings.quizPassThreshold <= 100)
})

runTest('SettingsService.getEmailSettings reflects environment RESEND_API_KEY status accurately', async () => {
  const originalKey = process.env.RESEND_API_KEY
  try {
    delete process.env.RESEND_API_KEY
    const withoutKey: EmailSettings = await SettingsService.getEmailSettings()
    assert.strictEqual(withoutKey.resendApiKeyConfigured, false)

    process.env.RESEND_API_KEY = 're_test_mock_key_123'
    const withKey: EmailSettings = await SettingsService.getEmailSettings()
    assert.strictEqual(withKey.resendApiKeyConfigured, true)
    assert.strictEqual(typeof withKey.fromName, 'string')
    assert.strictEqual(typeof withKey.fromEmail, 'string')
    assert.strictEqual(typeof withKey.dailySendLimit, 'number')
    assert.strictEqual(typeof withKey.retryFailedEmails, 'boolean')
  } finally {
    if (originalKey !== undefined) {
      process.env.RESEND_API_KEY = originalKey
    } else {
      delete process.env.RESEND_API_KEY
    }
  }
})

runTest('SettingsService.getNotificationSettings returns reminder, recap, and default channels', async () => {
  const settings: NotificationSettings = await SettingsService.getNotificationSettings()
  assert.strictEqual(typeof settings.dailyReminderEnabled, 'boolean')
  assert.strictEqual(typeof settings.dailyReminderTime, 'string')
  assert.ok(/^\d{2}:\d{2}$/.test(settings.dailyReminderTime))
  assert.strictEqual(typeof settings.inactivityReminderDays, 'number')
  assert.strictEqual(typeof settings.weeklyRecapEnabled, 'boolean')
  assert.strictEqual(typeof settings.weeklyRecapDay, 'number')
  assert.ok(settings.weeklyRecapDay >= 0 && settings.weeklyRecapDay <= 6)
  assert.strictEqual(typeof settings.defaultInAppEnabled, 'boolean')
  assert.strictEqual(typeof settings.defaultEmailEnabled, 'boolean')
})

runTest('SettingsService.getFeatureFlags returns all active runtime flags', async () => {
  const flags = await SettingsService.getFeatureFlags()
  assert.ok(Array.isArray(flags))
  assert.ok(flags.length >= 5)
  const emailFlag = flags.find((f) => f.key === 'EMAIL_ENABLED')
  assert.ok(emailFlag !== undefined)
  assert.strictEqual(typeof emailFlag.enabled, 'boolean')
})

runTest('SettingsService.getAllSettings returns all 5 workspace domains in parallel', async () => {
  const all = await SettingsService.getAllSettings()
  assert.ok(all.product)
  assert.ok(all.learning)
  assert.ok(all.email)
  assert.ok(all.notifications)
  assert.ok(Array.isArray(all.featureFlags))
})

runTest('SettingsService.updateProductSettings merges partial updates and preserves existing values', async () => {
  const updated = await SettingsService.updateProductSettings({
    siteName: 'Prodily PM Academy Custom',
    maintenanceMode: true,
  })
  assert.strictEqual(updated.siteName, 'Prodily PM Academy Custom')
  assert.strictEqual(updated.maintenanceMode, true)
  assert.strictEqual(typeof updated.contactEmail, 'string')
  assert.strictEqual(typeof updated.sessionTimeoutMinutes, 'number')
})

runTest('SettingsService.updateEmailSettings strips read-only fields on update', async () => {
  const updated = await SettingsService.updateEmailSettings({
    fromName: 'Prodily Support',
    resendApiKeyConfigured: false, // Read-only, must not overwrite
  })
  assert.strictEqual(updated.fromName, 'Prodily Support')
  assert.strictEqual(typeof updated.resendApiKeyConfigured, 'boolean')
})

runTest('SettingsService.updateLearningSettings saves streak freeze and certificate config', async () => {
  const updated = await SettingsService.updateLearningSettings({
    streakFreezeEnabled: false,
    quizPassThreshold: 85,
    certificateExpiryDays: 365,
  })
  assert.strictEqual(updated.streakFreezeEnabled, false)
  assert.strictEqual(updated.quizPassThreshold, 85)
  assert.strictEqual(updated.certificateExpiryDays, 365)
})

runTest('SettingsService.updateNotificationSettings saves reminder and recap config', async () => {
  const updated = await SettingsService.updateNotificationSettings({
    dailyReminderEnabled: true,
    dailyReminderTime: '10:30',
    weeklyRecapDay: 5,
  })
  assert.strictEqual(updated.dailyReminderEnabled, true)
  assert.strictEqual(updated.dailyReminderTime, '10:30')
  assert.strictEqual(updated.weeklyRecapDay, 5)
})

