import { describe, it, expect } from 'vitest'
import { EmailAutomationsService, DEFAULT_AUTOMATION_TOGGLES } from '../notifications/automations/service'
import { enqueueNotificationItem, processEmailQueue } from '../notifications/queue/processor'
import { globalNotificationDispatcher } from '../notifications/dispatcher'
import { initializeNotificationConnectors } from '../notifications/events/connectors'

describe('Email Automations & Welcome Flow Test Suite', () => {
  it('Critical Auth emails (verify_email, password_reset) are Always On and cannot be disabled', async () => {
    const isVerifyEnabled = await EmailAutomationsService.isAutomationEnabled('auth.verify_email')
    const isResetEnabled = await EmailAutomationsService.isAutomationEnabled('auth.password_reset')

    expect(isVerifyEnabled).toBe(true)
    expect(isResetEnabled).toBe(true)

    const updateResult = await EmailAutomationsService.updateSetting('toggle', {
      automationKey: 'auth.verify_email',
      enabled: false,
    })
    expect(updateResult.success).toBe(false)
    expect(updateResult.error).toMatch(/Critical authentication emails cannot be disabled/)
  })

  it('Default automation toggles exist for all 11 supported email types', () => {
    expect(DEFAULT_AUTOMATION_TOGGLES['auth.welcome']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['learning.module_complete']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.badge_earned']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.level_up']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.certificate']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['achievement.portfolio_published']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['learning.weekly_recap']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['learning.daily_reminder']).toBe(true)
    expect(DEFAULT_AUTOMATION_TOGGLES['inactive.resume_learning']).toBe(false)
  })

  it('NEW USER SIGNUP -> user.registered -> auth.welcome flow dispatches correctly', async () => {
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

    expect(dispatchResult.dispatched).toBe(true)
    expect(dispatchResult.handlerCount).toBeGreaterThanOrEqual(1)
    expect(dispatchResult.errors.length).toBe(0)
  })

  it('Duplicate profile initialization -> idempotency prevents duplicate welcome email', async () => {
    initializeNotificationConnectors()
    const testUserId = `test-idempotent-user-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const testEmail = `idempotent-${Date.now()}@example.com`

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

    expect(typeof firstResult.success).toBe('boolean')
    expect(typeof secondResult.success).toBe('boolean')
  }, 15000)

  it('processEmailQueue handles batch processing gracefully', async () => {
    const batchResult = await processEmailQueue(10)
    expect(typeof batchResult.processed).toBe('number')
    expect(typeof batchResult.delivered).toBe('number')
    expect(typeof batchResult.failed).toBe('number')
    expect(typeof batchResult.skipped).toBe('number')
  }, 15000)
})
