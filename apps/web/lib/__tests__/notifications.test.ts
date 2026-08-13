import assert from 'assert'
import {
  NotificationEventDispatcher,
  ResendProvider,
  ProviderRegistry,
  PriorityMatrix,
  FeatureFlagService,
  createDefaultNotificationPreferences,
  isChannelEnabledByPreferences,
  TemplateRegistryService,
  validateEventPayload,
  sortQueueItemsByPriority,
  isValidQueueStatusTransition,
  type EventEnvelope,
  type QueuedNotificationItem,
} from '../notifications'

console.log('🧪 Running Notification Platform Foundation Unit Test Suite...\n')

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

async function runAllTests() {
  // 1. Event Registration & Payload Validation
  runTest('validateEventPayload returns true for valid payloads and false for invalid', () => {
    const validLessonPayload = {
      lessonId: 'les_001',
      lessonTitle: 'User Research',
      lessonOrder: 1,
      moduleSlug: 'foundations',
      moduleName: 'Foundations',
      quizScore: 100,
      xpEarned: 50,
      totalXp: 150,
      completedAt: new Date().toISOString(),
    }
    assert.strictEqual(validateEventPayload('lesson.completed', validLessonPayload), true)

    const invalidPayload = { wrongField: 123 }
    assert.strictEqual(validateEventPayload('lesson.completed', invalidPayload), false)
  })

  // 2. Event Dispatching & Handlers
  await runTest('NotificationEventDispatcher dispatches events to registered handlers without error', async () => {
    const dispatcher = new NotificationEventDispatcher()
    let handledCount = 0

    const handler = (event: EventEnvelope) => {
      handledCount++
      assert.strictEqual(event.event, 'badge.earned')
    }

    const reg1 = dispatcher.registerHandler('badge.earned', 'handler-1', handler)
    assert.strictEqual(reg1, true)

    // Prevent duplicate registration
    const regDuplicate = dispatcher.registerHandler('badge.earned', 'handler-1', handler)
    assert.strictEqual(regDuplicate, false)

    const testEvent: EventEnvelope = {
      id: 'evt-123',
      event: 'badge.earned',
      userId: 'user-77',
      userEmail: 'test@example.com',
      userName: 'Test User',
      userTimezone: 'UTC',
      occurredAt: new Date().toISOString(),
      priority: 'medium',
      category: 'achievements',
      payload: {
        badgeKey: 'first_step',
        badgeName: 'First Step',
        badgeDescription: 'Completed 1st lesson',
        badgeIcon: 'award',
        badgeCategory: 'learning',
        earnedAt: new Date().toISOString(),
      },
    }

    const result = await dispatcher.dispatch(testEvent)
    assert.strictEqual(result.dispatched, true)
    assert.strictEqual(result.handlerCount, 1)
    assert.strictEqual(handledCount, 1)
  })

  // 3. Provider Abstraction & Resend Scaffold
  await runTest('ResendProvider scaffold healthCheck and send behavior', async () => {
    const provider = new ResendProvider()
    assert.strictEqual(provider.name, 'resend')
    assert.deepStrictEqual(provider.supportedChannels, ['email'])

    const health = await provider.healthCheck()
    const hasKey = Boolean(process.env.RESEND_API_KEY)
    assert.strictEqual(health.isHealthy, hasKey)

    const sendRes = await provider.send({
      recipient: { userId: 'u1', email: 'test@example.com' },
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVersion: 1,
      variables: { name: 'Alex' },
    })

    assert.strictEqual(sendRes.success, true)
    assert.strictEqual(sendRes.providerName, 'resend')
    assert.ok(sendRes.externalId)
  })

  // 4. Provider Registry
  runTest('ProviderRegistry filters providers by supported channel', () => {
    const registry = new ProviderRegistry()
    const emailProviders = registry.getProvidersForChannel('email')
    assert.strictEqual(emailProviders.length, 1)
    assert.strictEqual(emailProviders[0].name, 'resend')

    const pushProviders = registry.getProvidersForChannel('push')
    assert.strictEqual(pushProviders.length, 0)
  })

  // 5. Priority Matrix & Retry Delays
  runTest('PriorityMatrix calculates correct retry delays and bypass policies', () => {
    const matrix = new PriorityMatrix()

    const criticalDef = matrix.getDefinition('critical')
    assert.strictEqual(criticalDef.numericValue, 1)
    assert.strictEqual(criticalDef.allowBypassPreferences, true)

    const retryPolicy = matrix.calculateRetryDelay('high', 1, new Date('2026-08-05T12:00:00Z'))
    assert.strictEqual(retryPolicy.isMaxAttemptsExceeded, false)
    assert.strictEqual(retryPolicy.delayMinutes, 5)

    const maxRetryPolicy = matrix.calculateRetryDelay('high', 3, new Date('2026-08-05T12:00:00Z'))
    assert.strictEqual(maxRetryPolicy.isMaxAttemptsExceeded, true)
  })

  // 6. Feature Flag Service
  runTest('FeatureFlagService handles default lookups, toggles, and hydration', () => {
    const flags = new FeatureFlagService({
      EMAIL_ENABLED: true,
      WEEKLY_RECAP_ENABLED: false,
    })

    assert.strictEqual(flags.isEnabled('EMAIL_ENABLED'), true)
    assert.strictEqual(flags.isEnabled('WEEKLY_RECAP_ENABLED'), false)
    assert.strictEqual(flags.isEnabled('NON_EXISTENT_FLAG', true), true)

    flags.enable('WEEKLY_RECAP_ENABLED')
    assert.strictEqual(flags.isEnabled('WEEKLY_RECAP_ENABLED'), true)

    flags.disable('EMAIL_ENABLED')
    assert.strictEqual(flags.isEnabled('EMAIL_ENABLED'), false)
  })

  // 7. Preference Model & Channel Verification
  runTest('isChannelEnabledByPreferences evaluates category channel permissions', () => {
    const prefs = createDefaultNotificationPreferences('user-100')
    // Under new communication strategy, learning & achievement email defaults to false (In-App primary)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'learning', 'email'), false)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'security', 'email'), true)
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'marketing', 'email'), false) // Opt-in default false

    prefs.allEmail = false
    assert.strictEqual(isChannelEnabledByPreferences(prefs, 'security', 'email'), false)
  })

  // 8. Template Metadata & Version Registry
  runTest('TemplateRegistryService resolves active versions and deprecation status', () => {
    const registry = new TemplateRegistryService()

    registry.registerTemplate({
      id: 'tpl-1',
      templateKey: 'learning.module_complete',
      category: 'learning',
      currentVersion: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      versions: [
        {
          id: 'v1',
          templateId: 'tpl-1',
          version: 1,
          subjectLine: 'Old Subject',
          bodyText: 'Old text',
          bodyHtml: '<p>Old</p>',
          status: 'deprecated',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: 'v2',
          templateId: 'tpl-1',
          version: 2,
          subjectLine: 'Module {{name}} complete!',
          bodyText: 'Congrats!',
          bodyHtml: '<p>Congrats!</p>',
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    })

    const activeVer = registry.getActiveVersion('learning.module_complete')
    assert.strictEqual(activeVer?.version, 2)
    assert.strictEqual(activeVer?.subjectLine, 'Module {{name}} complete!')

    assert.strictEqual(registry.isVersionDeprecated('learning.module_complete', 1), true)
    assert.strictEqual(registry.isVersionDeprecated('learning.module_complete', 2), false)
  })

  // 9. Queue Helpers & Priority Ordering
  runTest('sortQueueItemsByPriority orders items by numeric priority ASC and schedule', () => {
    const now = new Date().toISOString()
    const items: QueuedNotificationItem[] = [
      {
        id: 'q3',
        userId: 'u1',
        channel: 'email',
        templateKey: 'learning.daily_reminder',
        templateVariables: {},
        eventType: 'system.daily_reminder',
        priority: 8,
        priorityLevel: 'low',
        status: 'pending',
        retry: { attemptCount: 0, maxAttempts: 2 },
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'q1',
        userId: 'u1',
        channel: 'email',
        templateKey: 'security.password_reset',
        templateVariables: {},
        eventType: 'password.reset_requested',
        priority: 1,
        priorityLevel: 'critical',
        status: 'pending',
        retry: { attemptCount: 0, maxAttempts: 5 },
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'q2',
        userId: 'u1',
        channel: 'email',
        templateKey: 'achievement.level_up',
        templateVariables: {},
        eventType: 'xp.level_up',
        priority: 2,
        priorityLevel: 'high',
        status: 'pending',
        retry: { attemptCount: 0, maxAttempts: 3 },
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]

    const sorted = sortQueueItemsByPriority(items)
    assert.strictEqual(sorted[0].id, 'q1') // Priority 1 (critical)
    assert.strictEqual(sorted[1].id, 'q2') // Priority 2 (high)
    assert.strictEqual(sorted[2].id, 'q3') // Priority 8 (low)
  })

  // 10. Queue Status Transitions
  runTest('isValidQueueStatusTransition enforces queue lifecycle states', () => {
    assert.strictEqual(isValidQueueStatusTransition('pending', 'processing'), true)
    assert.strictEqual(isValidQueueStatusTransition('processing', 'delivered'), true)
    assert.strictEqual(isValidQueueStatusTransition('delivered', 'pending'), false)
    assert.strictEqual(isValidQueueStatusTransition('failed', 'retrying'), true)
  })

  console.log(`\n✅ All ${passedTests} Notification Platform Unit Tests Passed Successfully!\n`)
}

runAllTests()
