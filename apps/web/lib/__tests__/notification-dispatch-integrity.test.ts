import { describe, it, expect, beforeEach } from 'vitest'
import { globalNotificationDispatcher } from '../notifications/dispatcher'
import { initializeNotificationConnectors } from '../notifications/events/connectors'
import { buildInAppContentFromEvent } from '../notifications/in-app/service'

describe('Notification Dispatch & Connector Integrity Test Suite (Phase 0)', () => {
  beforeEach(() => {
    initializeNotificationConnectors(true)
  })

  it('IN_APP_EVENTS includes quiz.completed, streak.updated, review.completed', () => {
    const quizContent = buildInAppContentFromEvent({
      id: 'evt-1',
      event: 'quiz.completed',
      userId: 'usr-1',
      userEmail: 'usr@test.com',
      userName: 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { lessonId: 'les_4kpbq6', lessonTitle: 'User Research', score: 93 },
    })
    expect(quizContent.title).toBe('Quiz complete')
    expect(quizContent.body).toBe('You scored 93 on the User Research quiz.')
    expect(quizContent.body).not.toContain('les_4kpbq6')

    // Leak protection test when lessonTitle contains a raw internal ID or is missing
    const fallbackContent = buildInAppContentFromEvent({
      id: 'evt-1b',
      event: 'quiz.completed',
      userId: 'usr-1',
      userEmail: 'usr@test.com',
      userName: 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { lessonId: 'les_4kpbq6', score: 85 },
    })
    expect(fallbackContent.body).toBe('You scored 85 on the Lesson quiz.')
    expect(fallbackContent.body).not.toContain('les_4kpbq6')

    const streakContent = buildInAppContentFromEvent({
      id: 'evt-2',
      event: 'streak.updated',
      userId: 'usr-1',
      userEmail: 'usr@test.com',
      userName: 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { currentStreak: 7 },
    })
    expect(streakContent.title).toContain('Welcome back')

    const reviewContent = buildInAppContentFromEvent({
      id: 'evt-3',
      event: 'review.completed',
      userId: 'usr-1',
      userEmail: 'usr@test.com',
      userName: 'Learner',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { cardsReviewedCount: 5, xpEarned: 10 },
    })
    expect(reviewContent.title).toBe('Review session finished')
  })

  it('user.verified event does NOT trigger auth.verify_email connector (no email loop)', async () => {
    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `user-verified-test-${Date.now()}`,
      event: 'user.verified',
      userId: 'usr-verified-1',
      userEmail: 'verified@example.com',
      userName: 'Verified User',
      userTimezone: 'UTC',
      priority: 'high',
      category: 'security',
      occurredAt: new Date().toISOString(),
      payload: { email: 'verified@example.com' },
    })

    expect(dispatchResult.dispatched).toBe(true)
    // Only in-app handler is registered for user.verified, no connector.auth.verify_email email handler
    expect(dispatchResult.handlerCount).toBe(1)
    expect(dispatchResult.errors.length).toBe(0)
  })

  it('quiz.completed dispatch succeeds cleanly', async () => {
    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `quiz-test-${Date.now()}`,
      event: 'quiz.completed',
      userId: 'usr-quiz-1',
      userEmail: 'quiz@example.com',
      userName: 'Quiz User',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { lessonId: 'les_quiz', score: 100 },
    })

    expect(dispatchResult.dispatched).toBe(true)
    expect(dispatchResult.errors.length).toBe(0)
  })

  it('capstone.submitted dispatch succeeds cleanly', async () => {
    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `capstone-test-${Date.now()}`,
      event: 'capstone.submitted',
      userId: 'usr-capstone-1',
      userEmail: 'capstone@example.com',
      userName: 'Capstone User',
      userTimezone: 'UTC',
      priority: 'medium',
      category: 'portfolio',
      occurredAt: new Date().toISOString(),
      payload: { submissionId: 'sub-1', moduleSlug: 'foundations', moduleTitle: 'Module 1' },
    })

    expect(dispatchResult.dispatched).toBe(true)
    expect(dispatchResult.errors.length).toBe(0)
  })

  it('streak.updated milestone dispatch succeeds cleanly', async () => {
    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `streak-test-${Date.now()}`,
      event: 'streak.updated',
      userId: 'usr-streak-1',
      userEmail: 'streak@example.com',
      userName: 'Streak User',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { currentStreak: 7 },
    })

    expect(dispatchResult.dispatched).toBe(true)
    expect(dispatchResult.errors.length).toBe(0)
  })

  it('review.completed dispatch succeeds cleanly', async () => {
    const dispatchResult = await globalNotificationDispatcher.dispatch({
      id: `review-test-${Date.now()}`,
      event: 'review.completed',
      userId: 'usr-review-1',
      userEmail: 'review@example.com',
      userName: 'Review User',
      userTimezone: 'UTC',
      priority: 'low',
      category: 'learning',
      occurredAt: new Date().toISOString(),
      payload: { cardsReviewedCount: 10, xpEarned: 20 },
    })

    expect(dispatchResult.dispatched).toBe(true)
    expect(dispatchResult.errors.length).toBe(0)
  })
})
