import { describe, it, expect } from 'vitest'
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

describe('Notification Platform Foundation Unit Test Suite', () => {
  it('validateEventPayload returns true for valid payloads and false for invalid', () => {
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
    expect(validateEventPayload('lesson.completed', validLessonPayload)).toBe(true)

    const invalidPayload = { wrongField: 123 }
    expect(validateEventPayload('lesson.completed', invalidPayload)).toBe(false)
  })

  it('NotificationEventDispatcher dispatches events to registered handlers without error', async () => {
    const dispatcher = new NotificationEventDispatcher()
    let handledCount = 0

    const handler = (event: EventEnvelope) => {
      handledCount++
      expect(event.event).toBe('badge.earned')
    }

    const reg1 = dispatcher.registerHandler('badge.earned', 'handler-1', handler)
    expect(reg1).toBe(true)

    const regDuplicate = dispatcher.registerHandler('badge.earned', 'handler-1', handler)
    expect(regDuplicate).toBe(false)

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
    expect(result.dispatched).toBe(true)
    expect(result.handlerCount).toBe(1)
    expect(handledCount).toBe(1)
  })

  it('ResendProvider scaffold healthCheck and send behavior', async () => {
    const provider = new ResendProvider()
    expect(provider.name).toBe('resend')
    expect(provider.supportedChannels).toEqual(['email'])

    const health = await provider.healthCheck()
    const hasKey = Boolean(process.env.RESEND_API_KEY)
    expect(health.isHealthy).toBe(hasKey)

    const sendRes = await provider.send({
      recipient: { userId: 'u1', email: 'test@example.com' },
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVersion: 1,
      variables: { name: 'Alex' },
    })

    expect(sendRes.success).toBe(true)
    expect(sendRes.providerName).toBe('resend')
    expect(sendRes.externalId).toBeDefined()
  })

  it('BrevoProvider scaffold healthCheck and send behavior', async () => {
    const { BrevoProvider } = await import('../notifications')
    const provider = new BrevoProvider()
    expect(provider.name).toBe('brevo')
    expect(provider.supportedChannels).toEqual(['email'])

    const health = await provider.healthCheck()
    const hasKey = Boolean(process.env.BREVO_API_KEY)
    expect(health.isHealthy).toBe(hasKey)

    const sendRes = await provider.send({
      recipient: { userId: 'u1', email: 'test@example.com', name: 'Alex' },
      channel: 'email',
      templateKey: 'auth.welcome',
      templateVersion: 1,
      variables: { name: 'Alex', subject: 'Welcome to Prodily' },
    })

    expect(sendRes.success).toBe(true)
    expect(sendRes.providerName).toBe('brevo')
    expect(sendRes.externalId).toBeDefined()
  })

  it('ProviderRegistry filters providers by supported channel', () => {
    const registry = new ProviderRegistry()
    const emailProviders = registry.getProvidersForChannel('email')
    expect(emailProviders.length).toBe(2)
    const names = emailProviders.map((p) => p.name)
    expect(names).toContain('brevo')
    expect(names).toContain('resend')

    const pushProviders = registry.getProvidersForChannel('push')
    expect(pushProviders.length).toBe(0)
  })

  it('PriorityMatrix calculates correct retry delays and bypass policies', () => {
    const matrix = new PriorityMatrix()

    const criticalDef = matrix.getDefinition('critical')
    expect(criticalDef.numericValue).toBe(1)
    expect(criticalDef.allowBypassPreferences).toBe(true)

    const retryPolicy = matrix.calculateRetryDelay('high', 1, new Date('2026-08-05T12:00:00Z'))
    expect(retryPolicy.isMaxAttemptsExceeded).toBe(false)
    expect(retryPolicy.delayMinutes).toBe(5)

    const maxRetryPolicy = matrix.calculateRetryDelay('high', 3, new Date('2026-08-05T12:00:00Z'))
    expect(maxRetryPolicy.isMaxAttemptsExceeded).toBe(true)
  })

  it('FeatureFlagService handles default lookups, toggles, and hydration', () => {
    const flags = new FeatureFlagService({
      EMAIL_ENABLED: true,
      WEEKLY_RECAP_ENABLED: false,
    })

    expect(flags.isEnabled('EMAIL_ENABLED')).toBe(true)
    expect(flags.isEnabled('WEEKLY_RECAP_ENABLED')).toBe(false)
    expect(flags.isEnabled('NON_EXISTENT_FLAG', true)).toBe(true)

    flags.enable('WEEKLY_RECAP_ENABLED')
    expect(flags.isEnabled('WEEKLY_RECAP_ENABLED')).toBe(true)

    flags.disable('EMAIL_ENABLED')
    expect(flags.isEnabled('EMAIL_ENABLED')).toBe(false)
  })

  it('isChannelEnabledByPreferences evaluates category channel permissions', () => {
    const prefs = createDefaultNotificationPreferences('user-100')
    expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(false)
    expect(isChannelEnabledByPreferences(prefs, 'security', 'email')).toBe(true)
    expect(isChannelEnabledByPreferences(prefs, 'marketing', 'email')).toBe(false)

    prefs.allEmail = false
    expect(isChannelEnabledByPreferences(prefs, 'security', 'email')).toBe(false)
  })

  it('TemplateRegistryService resolves active versions and deprecation status', () => {
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
    expect(activeVer?.version).toBe(2)
    expect(activeVer?.subjectLine).toBe('Module {{name}} complete!')

    expect(registry.isVersionDeprecated('learning.module_complete', 1)).toBe(true)
    expect(registry.isVersionDeprecated('learning.module_complete', 2)).toBe(false)
  })

  it('sortQueueItemsByPriority orders items by numeric priority ASC and schedule', () => {
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
    expect(sorted[0].id).toBe('q1')
    expect(sorted[1].id).toBe('q2')
    expect(sorted[2].id).toBe('q3')
  })

  it('isValidQueueStatusTransition enforces queue lifecycle states', () => {
    expect(isValidQueueStatusTransition('pending', 'processing')).toBe(true)
    expect(isValidQueueStatusTransition('processing', 'delivered')).toBe(true)
    expect(isValidQueueStatusTransition('delivered', 'pending')).toBe(false)
    expect(isValidQueueStatusTransition('failed', 'retrying')).toBe(true)
  })
})
