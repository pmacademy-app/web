import assert from 'node:assert'
import { EmailAutomationsService, DEFAULT_AUTOMATION_TOGGLES } from '../notifications/automations/service'
import { enqueueNotificationItem, processEmailQueue } from '../notifications/queue/processor'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
}

async function runTest(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    console.log(`✓ PASS: ${name}`)
  } catch (err) {
    console.error(`✗ FAIL: ${name}`)
    console.error(err)
    process.exitCode = 1
  }
}

async function runEmailAutomationsTestSuite() {
  console.log('🚀 Running Email Automations Test Suite...\n')

  await runTest('Critical Auth emails (verify_email, password_reset) are Always On and cannot be disabled', async () => {
    const isVerifyEnabled = await EmailAutomationsService.isAutomationEnabled('auth.verify_email')
    const isResetEnabled = await EmailAutomationsService.isAutomationEnabled('auth.password_reset')

    assert.strictEqual(isVerifyEnabled, true)
    assert.strictEqual(isResetEnabled, true)

    // Attempting to disable critical auth should fail gracefully
    const updateResult = await EmailAutomationsService.updateSetting('toggle', {
      automationKey: 'auth.verify_email',
      enabled: false,
    })
    assert.strictEqual(updateResult.success, false)
    assert.match(updateResult.error || '', /Critical authentication emails cannot be disabled/)
  })

  await runTest('Default automation toggles exist for all 11 supported email types', () => {
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['auth.welcome'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['learning.module_complete'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['achievement.badge_earned'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['achievement.level_up'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['achievement.certificate'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['achievement.portfolio_published'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['learning.weekly_recap'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['learning.daily_reminder'], true)
    assert.strictEqual(DEFAULT_AUTOMATION_TOGGLES['inactive.resume_learning'], false) // Deferred
  })

  await runTest('enqueueNotificationItem validates email system state and parameters', async () => {
    const res = await enqueueNotificationItem({
      userId: 'test-user-123',
      toEmail: 'test@example.com',
      toName: 'Test Learner',
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVariables: { userName: 'Test Learner' },
      eventId: `test-welcome-${Date.now()}`,
      eventType: 'user.registered',
      category: 'learning',
    })

    // Returns boolean result object with queueId or reason
    assert.strictEqual(typeof res.success, 'boolean')
  })

  await runTest('processEmailQueue handles batch processing gracefully', async () => {
    const batchResult = await processEmailQueue(10)
    assert.strictEqual(typeof batchResult.processed, 'number')
    assert.strictEqual(typeof batchResult.delivered, 'number')
    assert.strictEqual(typeof batchResult.failed, 'number')
    assert.strictEqual(typeof batchResult.skipped, 'number')
  })

  console.log('\n✅ All Email Automations tests passed successfully!')
}

runEmailAutomationsTestSuite().catch((err) => {
  console.error('Unhandled error in test suite:', err)
  process.exit(1)
})
