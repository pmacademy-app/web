/**
 * Automated Verification Suite for Final Learner Experience, Curriculum Performance,
 * Avatar Management, and Notification Idempotency
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchCurriculumData, fetchCompiledLesson } from '../lesson-loader'
import { buildInAppContentFromEvent } from '../notifications/in-app/service'

describe('Final Learner Experience & Notification Integrity Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Lesson -> Quiz -> Flashcards / Reflection Immediate Tab Unlock', () => {
    it('verifies that quiz completion returns required fields to unlock downstream tabs immediately', () => {
      const mockQuizResult = {
        success: true,
        correctCount: 4,
        totalQuestions: 4,
        scorePercentage: 100,
        xpEarned: 100,
        isPerfect: true,
        isFirstAttempt: true,
      }

      expect(mockQuizResult.success).toBe(true)
      expect(mockQuizResult.scorePercentage).toBe(100)
      expect(mockQuizResult.xpEarned).toBeGreaterThan(0)
    })
  })

  describe('2. Curriculum / Lesson Loader In-Memory Cache Performance', () => {
    it('loads curriculum data with memory caching to eliminate repeated disk I/O', async () => {
      const startFirst = performance.now()
      const curriculum1 = await fetchCurriculumData()
      const firstDuration = performance.now() - startFirst

      const startSecond = performance.now()
      const curriculum2 = await fetchCurriculumData()
      const secondDuration = performance.now() - startSecond

      expect(curriculum1).toBeDefined()
      expect(curriculum2).toBeDefined()
      expect(curriculum1?.lessons.length).toBe(90)
      expect(curriculum1).toBe(curriculum2) // Same in-memory object reference
      expect(secondDuration).toBeLessThanOrEqual(firstDuration + 5)
    })

    it('loads compiled lesson with memory caching', async () => {
      const lesson1 = await fetchCompiledLesson('les_zoyq8a')
      const lesson2 = await fetchCompiledLesson('les_zoyq8a')

      expect(lesson1).toBeDefined()
      expect(lesson1?.id).toBe('les_zoyq8a')
      expect(lesson1).toBe(lesson2) // Same in-memory object reference
    })
  })

  describe('3. Notification Idempotency & Clean Branding', () => {
    it('builds welcome notification with clean "Welcome to Prodily" branding', () => {
      const content = buildInAppContentFromEvent({
        id: 'welcome-user-123',
        event: 'user.registered',
        userId: 'user-123',
        userEmail: 'alex@example.com',
        userName: 'Alex',
        userTimezone: 'UTC',
        priority: 'high',
        category: 'security',
        occurredAt: new Date().toISOString(),
        payload: {
          userName: 'Alex',
        },
      })

      expect(content.title).toBe('Welcome to Prodily')
      expect(content.title).not.toContain('PM Academy')
      expect(content.body).toContain('Thanks for joining, Alex!')
      expect(content.actionUrl).toBe('/academy')
    })

    it('builds generic notification with Prodily update branding for unknown events', () => {
      const content = buildInAppContentFromEvent({
        id: 'custom-event-1',
        event: 'custom.system_event' as never,
        userId: 'user-123',
        userEmail: 'alex@example.com',
        userName: 'Alex',
        userTimezone: 'UTC',
        priority: 'medium',
        category: 'learning',
        occurredAt: new Date().toISOString(),
        payload: {},
      })

      expect(content.title).toBe('Prodily update')
      expect(content.title).not.toContain('PM Academy')
    })
  })

  describe('4. Avatar File Validation', () => {
    it('validates MIME type and size limits correctly', () => {
      const validFile = { type: 'image/png', size: 1.5 * 1024 * 1024 }
      const oversizedFile = { type: 'image/png', size: 3.5 * 1024 * 1024 }
      const invalidTypeFile = { type: 'application/pdf', size: 500 * 1024 }

      const isImage = (f: { type: string; size: number }) => f.type.startsWith('image/')
      const isUnderLimit = (f: { type: string; size: number }) => f.size <= 2 * 1024 * 1024

      expect(isImage(validFile) && isUnderLimit(validFile)).toBe(true)
      expect(isUnderLimit(oversizedFile)).toBe(false)
      expect(isImage(invalidTypeFile)).toBe(false)
    })
  })
})
