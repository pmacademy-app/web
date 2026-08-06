import assert from 'assert'
import {
  globalNotificationDispatcher,
  initializeNotificationConnectors,
  enqueueNotificationItem,
  processEmailQueue,
  clearInMemoryQueue,
  getInMemoryQueue,
  getInMemoryDeadLetter,
  addInMemorySuppression,
  globalFeatureFlagService,
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
} from '../notifications'
import { renderEmailTemplate } from '../../emails'

console.log('🧪 Running Email Engine & Delivery Unit Test Suite...\n')

let passedTests = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passedTests++
          console.log(`  ✓ ${name}`)
        })
        .catch((err) => {
          console.error(`  ✕ ${name}`)
          console.error(err)
          process.exit(1)
        })
    }
    passedTests++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function runAllEmailEngineTests() {
  clearInMemoryQueue()

  // 1. Template Rendering (React Email -> HTML & Text Output)
  await runTest('renderEmailTemplate compiles React Email components to HTML and plain text', async () => {
    const rendered = await renderEmailTemplate('auth.welcome', { userName: 'Sarah' })
    assert.ok(rendered.html.includes('PM Academy'))
    assert.ok(rendered.html.includes('Welcome to PM Academy, Sarah!'))
    assert.ok(rendered.text.includes('Welcome to PM Academy'))
    assert.ok(rendered.subject.includes('Welcome to PM Academy'))

    const badgeRendered = await renderEmailTemplate('achievement.badge_earned', {
      userName: 'Sarah',
      badgeName: 'First Step',
      badgeDescription: 'Completed 1st lesson',
    })
    assert.ok(badgeRendered.subject.includes('First Step'))
    assert.ok(badgeRendered.html.includes('First Step'))
  })

  // 2. Event -> Connector -> Queue Enqueueing
  await runTest('Event dispatching triggers connector and enqueues email item', async () => {
    clearInMemoryQueue()
    initializeNotificationConnectors()

    const eventResult = await globalNotificationDispatcher.dispatch({
      id: 'evt-welcome-001',
      event: 'user.registered',
      userId: 'usr-sarah',
      userEmail: 'sarah@example.com',
      userName: 'Sarah',
      userTimezone: 'UTC',
      occurredAt: new Date().toISOString(),
      priority: 'high',
      category: 'security',
      payload: {
        userId: 'usr-sarah',
        email: 'sarah@example.com',
        name: 'Sarah',
        registeredAt: new Date().toISOString(),
      },
    })

    assert.strictEqual(eventResult.dispatched, true)
    const queue = getInMemoryQueue()
    assert.strictEqual(queue.length, 1)
    assert.strictEqual(queue[0].templateKey, 'auth.welcome')
    assert.strictEqual(queue[0].toEmail, 'sarah@example.com')
  })

  // 3. Queue Processor Execution & Delivery
  await runTest('processEmailQueue processes pending items and marks delivered', async () => {
    clearInMemoryQueue()

    await enqueueNotificationItem({
      userId: 'usr-10',
      toEmail: 'test10@example.com',
      channel: 'email',
      templateKey: 'achievement.level_up',
      templateVariables: { userName: 'Alex', newLevel: 3, totalXp: 900 },
      eventType: 'xp.level_up',
      category: 'achievements',
      priorityLevel: 'critical',
    })

    const processResult = await processEmailQueue(10)
    assert.strictEqual(processResult.processed, 1)
    assert.strictEqual(processResult.delivered, 1)

    const queue = getInMemoryQueue()
    assert.strictEqual(queue[0].status, 'delivered')
    assert.ok(queue[0].deliveredAt)
  })

  // 4. Duplicate Prevention
  await runTest('enqueueNotificationItem prevents duplicate pending items with same eventId and templateKey', async () => {
    clearInMemoryQueue()

    const res1 = await enqueueNotificationItem({
      userId: 'usr-dup',
      toEmail: 'dup@example.com',
      channel: 'email',
      templateKey: 'learning.module_complete',
      templateVariables: { moduleName: 'Foundations' },
      eventId: 'evt-dup-100',
      eventType: 'module.completed',
      category: 'learning',
      priorityLevel: 'critical',
    })

    assert.strictEqual(res1.success, true)

    const res2 = await enqueueNotificationItem({
      userId: 'usr-dup',
      toEmail: 'dup@example.com',
      channel: 'email',
      templateKey: 'learning.module_complete',
      templateVariables: { moduleName: 'Foundations' },
      eventId: 'evt-dup-100',
      eventType: 'module.completed',
      category: 'learning',
      priorityLevel: 'critical',
    })

    assert.strictEqual(res2.success, false)
    assert.ok(res2.reason?.includes('Duplicate'))
  })

  // 5. Feature Flags Gating
  await runTest('Feature flag EMAIL_ENABLED gating halts email queueing', async () => {
    clearInMemoryQueue()
    globalFeatureFlagService.disable('EMAIL_ENABLED')

    const res = await enqueueNotificationItem({
      userId: 'usr-ff',
      toEmail: 'ff@example.com',
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVariables: {},
      eventType: 'user.registered',
      category: 'security',
    })

    assert.strictEqual(res.success, false)
    assert.ok(res.reason?.includes('disabled'))

    globalFeatureFlagService.enable('EMAIL_ENABLED')
  })

  // 6. User Preferences Channel Gating
  runTest('User notification preferences block disabled non-critical email categories', () => {
    const prefs = createDefaultNotificationPreferences('usr-prefs')
    prefs.marketing.email = false

    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'marketing', 'email'), false)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'security', 'email'), true)
  })

  // 7. Suppression List Handling
  await runTest('Suppression list marks recipient emails as suppressed during processing', async () => {
    clearInMemoryQueue()
    addInMemorySuppression('bounced@example.com')

    await enqueueNotificationItem({
      userId: 'usr-suppressed',
      toEmail: 'bounced@example.com',
      channel: 'email',
      templateKey: 'learning.weekly_recap',
      templateVariables: {},
      eventType: 'system.weekly_recap',
      category: 'learning',
      priorityLevel: 'critical',
    })

    const processRes = await processEmailQueue(10)
    assert.strictEqual(processRes.suppressed, 1)

    const queue = getInMemoryQueue()
    assert.strictEqual(queue[0].status, 'suppressed')
  })

  // 8. Dead-Letter Queue Handling
  await runTest('Invalid templateKey moves queued item to dead-letter queue on processing', async () => {
    clearInMemoryQueue()

    await enqueueNotificationItem({
      userId: 'usr-dead',
      toEmail: 'dead@example.com',
      channel: 'email',
      templateKey: 'non_existent_template_key',
      templateVariables: {},
      eventType: 'bad.event',
      category: 'learning',
      priorityLevel: 'critical',
    })

    const processRes = await processEmailQueue(10)
    assert.strictEqual(processRes.failed, 1)

    const deadLetters = getInMemoryDeadLetter()
    assert.strictEqual(deadLetters.length, 1)
    assert.strictEqual(deadLetters[0].templateKey, 'non_existent_template_key')
    assert.ok(deadLetters[0].failureReason.includes('Template Render Error'))
  })

  console.log(`\n✅ All ${passedTests} Email Engine Unit Tests Passed Successfully!\n`)
}

runAllEmailEngineTests()
