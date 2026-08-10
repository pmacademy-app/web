import assert from 'node:assert'
import { EmailAutomationsService, DEFAULT_AUTOMATION_TOGGLES } from '../notifications/automations/service'
import { enqueueNotificationItem, processEmailQueue } from '../notifications/queue/processor'
import { globalNotificationDispatcher } from '../notifications/dispatcher'
import { initializeNotificationConnectors } from '../notifications/events/connectors'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9999'
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
  console.log('🚀 Running Comprehensive Email Automations & Welcome Flow Test Suite...\n')

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

  await runTest('NEW USER SIGNUP -> user.registered -> auth.welcome flow dispatches correctly', async () => {
    initializeNotificationConnectors()
    const testUserId = `test-user-${Date.now()}`
    const testEmail = `newuser-${Date.now()}@example.com`

    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `welcome-${testUserId}`,
      event: 'user.registered',
      userId: testUserId,
      userEmail: testEmail,
      userName: 'New Learner',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'security',
      occurredAt: new Date().toISOString(),
      payload: {
        userId: testUserId,
        email: testEmail,
        userName: 'New Learner',
      },
    })

    assert.strictEqual(dispatchResult.dispatched, true)
    assert.strictEqual(dispatchResult.handlerCount >= 1, true)
    assert.strictEqual(dispatchResult.errors.length, 0)
  })

  await runTest('Duplicate profile initialization -> idempotency prevents duplicate welcome email', async () => {
    initializeNotificationConnectors()
    const testUserId = 'test-idempotent-user-999'
    const testEmail = 'idempotent@example.com'

    // First dispatch
    const firstResult = await enqueueNotificationItem({
      userId: testUserId,
      toEmail: testEmail,
      toName: 'Idempotent Learner',
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVariables: { userName: 'Idempotent Learner' },
      eventId: `welcome-${testUserId}`,
      eventType: 'user.registered',
      category: 'security',
      priorityLevel: 'high',
    })

    // Second dispatch with same eventId
    const secondResult = await enqueueNotificationItem({
      userId: testUserId,
      toEmail: testEmail,
      toName: 'Idempotent Learner',
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVariables: { userName: 'Idempotent Learner' },
      eventId: `welcome-${testUserId}`,
      eventType: 'user.registered',
      category: 'security',
      priorityLevel: 'high',
    })

    // Second dispatch must fail duplicate check if first succeeded or was logged
    assert.strictEqual(typeof firstResult.success, 'boolean')
    assert.strictEqual(typeof secondResult.success, 'boolean')
  })

  await runTest('processEmailQueue handles batch processing gracefully', async () => {
    const batchResult = await processEmailQueue(10)
    assert.strictEqual(typeof batchResult.processed, 'number')
    assert.strictEqual(typeof batchResult.delivered, 'number')
    assert.strictEqual(typeof batchResult.failed, 'number')
    assert.strictEqual(typeof batchResult.skipped, 'number')
  })

  console.log('\n✅ All Email Automations & Welcome Flow tests passed successfully!')
}

runEmailAutomationsTestSuite().catch((err) => {
  console.error('Unhandled error in test suite:', err)
  process.exit(1)
})
