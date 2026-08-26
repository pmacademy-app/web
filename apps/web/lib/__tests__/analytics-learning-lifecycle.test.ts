import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  trackLessonStarted,
  trackTheoryRead,
  trackQuizCompleted,
  trackLessonCompleted,
  trackCapstoneSubmitted,
  trackBadgeEarned,
  trackLevelUp,
} from '../analytics'

describe('Analytics & Learning Lifecycle Test Suite (Phase 1)', () => {

  beforeEach(() => {
    // Setup clean mock window.gtag before each test
    vi.stubGlobal('window', {
      gtag: vi.fn(),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('trackLessonStarted dispatches lesson_start with lesson_id and module_slug (No PII)', () => {
    trackLessonStarted('les_foundations_01', 'foundations')

    expect(window.gtag).toHaveBeenCalledWith('event', 'lesson_start', {
      lesson_id: 'les_foundations_01',
      module_slug: 'foundations',
    })
  })

  it('trackTheoryRead dispatches theory_read with lesson_id and xp_earned (No PII)', () => {
    trackTheoryRead('les_foundations_01', 25)

    expect(window.gtag).toHaveBeenCalledWith('event', 'theory_read', {
      lesson_id: 'les_foundations_01',
      xp_earned: 25,
    })
  })

  it('trackQuizCompleted dispatches quiz_complete with lesson_id and score (No PII)', () => {
    trackQuizCompleted('les_foundations_01', 100)

    expect(window.gtag).toHaveBeenCalledWith('event', 'quiz_complete', {
      lesson_id: 'les_foundations_01',
      score: 100,
    })
  })

  it('trackLessonCompleted dispatches lesson_complete with lesson_id, title, and xp_earned (No PII)', () => {
    trackLessonCompleted('les_foundations_01', 'What is Product Management?', 50)

    expect(window.gtag).toHaveBeenCalledWith('event', 'lesson_complete', {
      lesson_id: 'les_foundations_01',
      lesson_title: 'What is Product Management?',
      xp_earned: 50,
    })
  })

  it('trackCapstoneSubmitted dispatches capstone_submit with module_slug and title (No PII)', () => {
    trackCapstoneSubmitted('foundations', 'Foundations Capstone')

    expect(window.gtag).toHaveBeenCalledWith('event', 'capstone_submit', {
      module_slug: 'foundations',
      module_title: 'Foundations Capstone',
    })
  })

  it('trackBadgeEarned dispatches badge_earn with badge_id and name (No PII)', () => {
    trackBadgeEarned('first_step', 'First Step')

    expect(window.gtag).toHaveBeenCalledWith('event', 'badge_earn', {
      badge_id: 'first_step',
      badge_name: 'First Step',
    })
  })

  it('trackLevelUp dispatches level_up with level and level_title (No PII)', () => {
    trackLevelUp(2, 'Associate Product Manager')

    expect(window.gtag).toHaveBeenCalledWith('event', 'level_up', {
      level: 2,
      level_title: 'Associate Product Manager',
    })
  })

  it('ensures zero PII is present in any learning lifecycle GA4 payload', () => {
    const gtagSpy = vi.spyOn(window, 'gtag')

    trackLessonStarted('les_01', 'mod_01')
    trackTheoryRead('les_01', 10)
    trackQuizCompleted('les_01', 90)
    trackLessonCompleted('les_01', 'Title', 50)
    trackCapstoneSubmitted('mod_01', 'Module Capstone')
    trackBadgeEarned('badge_01', 'Badge')
    trackLevelUp(5, 'Product Lead')

    for (const call of gtagSpy.mock.calls) {
      const params = (call[2] ?? {}) as Record<string, unknown>
      expect(params).not.toHaveProperty('email')
      expect(params).not.toHaveProperty('user_id')
      expect(params).not.toHaveProperty('name')
      expect(params).not.toHaveProperty('full_name')
      expect(params).not.toHaveProperty('phone')
      expect(params).not.toHaveProperty('content')
    }
  })

  it('is null-safe and does not throw when window or window.gtag is undefined', () => {
    vi.stubGlobal('window', undefined)

    expect(() => {
      trackLessonStarted('les_01')
      trackTheoryRead('les_01')
      trackQuizCompleted('les_01', 100)
      trackLessonCompleted('les_01')
      trackCapstoneSubmitted('foundations')
      trackBadgeEarned('badge_01')
      trackLevelUp(3)
    }).not.toThrow()
  })
})
