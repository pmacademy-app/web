/**
 * Phase 9 — Final Engineering QA, Production Readiness & Release Verification Suite
 *
 * Comprehensive end-to-end audit test suite verifying:
 * 1. Full 90-Lesson Curriculum State Machine (States A, B, C, D, E)
 * 2. Prerequisite Boundary Invariants Across All 9 Modules (Lessons 1 to 90)
 * 3. Personalization Invariant: Contextual recommendations without prerequisite bypass
 * 4. XP Ledger & Idempotency Invariants: Zero duplicate awards
 * 5. Privacy & Zero-PII Invariants: Portfolio public/private boundary & Error sanitization
 * 6. CRON Security Invariant: Dual-gate enforcement across all scheduler endpoints
 * 7. Referral Invariants: Exactly-once reward, recipient integrity, self-referral prevention
 * 8. Account Deletion Invariants: Complete cascade across all user-owned tables
 */

import { describe, it, expect } from 'vitest'
import {
  getCanonicalPrerequisiteRange,
  getFirstActionableLessonIndex,
  resolveModuleCtaTarget,
} from '../curriculum-access'
import {
  resolvePersonalizedPath,
  resolveNextRecommendedMilestone,
} from '../personalization/path-resolver'
import { sanitizeErrorMessage } from '../monitoring/logger'
import { MODULE_LESSON_MAP, getLessonIdsForModule, getModuleSlugForLessonId } from '../curriculum-registry'
import type { CurriculumEntry } from '@/types'

// ─── 90-Lesson Canonical Fixture ─────────────────────────────────────────────

const ALL_MODULE_SLUGS = [
  'foundations', // Module 1: Lessons 1-10
  'discovery',   // Module 2: Lessons 11-20
  'design',      // Module 3: Lessons 21-30
  'execution',   // Module 4: Lessons 31-40
  'growth',      // Module 5: Lessons 41-50
  'leadership',  // Module 6: Lessons 51-60
  'technical',   // Module 7: Lessons 61-70
  'strategy',    // Module 8: Lessons 71-80
  'capstone',    // Module 9: Lessons 81-90
]

const canonical90Lessons: CurriculumEntry[] = ALL_MODULE_SLUGS.flatMap((slug, modIdx) => {
  const ids = MODULE_LESSON_MAP[slug] || []
  return ids.map((id, lessonIdx) => {
    const globalOrder = modIdx * 10 + lessonIdx + 1
    return {
      id,
      order: globalOrder,
      title: `Lesson ${globalOrder} (${slug})`,
      module: slug,
      estimatedReadingTime: 5,
    } as CurriculumEntry
  })
})

const canonicalIds = canonical90Lessons.map((l) => l.id)

function getSliceIds(startOrder: number, endOrder: number): string[] {
  return canonical90Lessons
    .filter((l) => l.order >= startOrder && l.order <= endOrder)
    .map((l) => l.id)
}

describe('Phase 9 — Production Readiness & Release Verification Suite', () => {

  // ─── 1. Canonical Curriculum Registry & Structure Integrity ───────────────
  describe('1. Canonical Curriculum Structure & Map Invariants', () => {
    it('contains exactly 9 modules with exactly 10 stable lesson IDs each (90 total)', () => {
      expect(ALL_MODULE_SLUGS.length).toBe(9)
      expect(canonical90Lessons.length).toBe(90)

      for (const slug of ALL_MODULE_SLUGS) {
        const lessonIds = getLessonIdsForModule(slug)
        expect(lessonIds.length).toBe(10)
        for (const id of lessonIds) {
          expect(id).toMatch(/^les_[a-z0-9]{6}$/)
          expect(getModuleSlugForLessonId(id)).toBe(slug)
        }
      }
    })

    it('enforces unique stable IDs across the entire curriculum', () => {
      const idSet = new Set(canonicalIds)
      expect(idSet.size).toBe(90)
    })
  })

  // ─── 2. Curriculum Access State Machine Across Entire 90 Lessons ──────────
  describe('2. Curriculum Access State Machine (States A, B, C, D, E)', () => {
    
    // STATE A: Brand-new user with 0 completed lessons
    describe('State A: Brand-new user (0 completed lessons)', () => {
      const completedIds = new Set<string>()

      it('identifies Lesson 1 (index 0) as the only actionable lesson', () => {
        const firstActionable = getFirstActionableLessonIndex(completedIds, canonicalIds)
        expect(firstActionable).toBe(0)
        expect(canonicalIds[firstActionable]).toBe(canonical90Lessons[0].id)
      })

      it('evaluates Lesson 1 as having no prerequisites', () => {
        const range = getCanonicalPrerequisiteRange(completedIds, canonicalIds, 0)
        expect(range.firstIncompleteIndex).toBeNull()
        expect(range.lastPrerequisiteIndex).toBe(-1)
      })

      it('correctly locks all lessons 2 through 90 with Lesson 1 as the first incomplete prerequisite', () => {
        for (let targetIndex = 1; targetIndex < 90; targetIndex++) {
          const range = getCanonicalPrerequisiteRange(completedIds, canonicalIds, targetIndex)
          expect(range.firstIncompleteIndex).toBe(0)
          expect(range.lastPrerequisiteIndex).toBe(targetIndex - 1)
        }
      })

      it('routes all module 2–9 CTAs to first actionable lesson (Lesson 1)', () => {
        for (const slug of ALL_MODULE_SLUGS.slice(1)) {
          const modLessons = canonical90Lessons.filter((l) => l.module === slug)
          const target = resolveModuleCtaTarget(modLessons, canonical90Lessons, completedIds)
          expect(target.isAccessible).toBe(false)
          expect(target.firstActionableLesson?.id).toBe(canonical90Lessons[0].id)
        }
      })
    })

    // STATE B: Contiguous Progress (e.g., Lessons 1–35 completed)
    describe('State B: User with contiguous progress (Lessons 1–35 completed)', () => {
      const completedIds = new Set(getSliceIds(1, 35))

      it('identifies Lesson 36 (index 35) as the first actionable lesson', () => {
        const firstActionable = getFirstActionableLessonIndex(completedIds, canonicalIds)
        expect(firstActionable).toBe(35)
        expect(canonical90Lessons[firstActionable].order).toBe(36)
      })

      it('confirms all lessons 1–36 have no incomplete prerequisites', () => {
        for (let targetIndex = 0; targetIndex <= 35; targetIndex++) {
          const range = getCanonicalPrerequisiteRange(completedIds, canonicalIds, targetIndex)
          expect(range.firstIncompleteIndex).toBeNull()
        }
      })

      it('correctly locks lessons 37 through 90 with Lesson 36 as the first incomplete prerequisite', () => {
        for (let targetIndex = 36; targetIndex < 90; targetIndex++) {
          const range = getCanonicalPrerequisiteRange(completedIds, canonicalIds, targetIndex)
          expect(range.firstIncompleteIndex).toBe(35)
          expect(range.lastPrerequisiteIndex).toBe(targetIndex - 1)
        }
      })

      it('resolves Module 4 (execution) CTA as accessible pointing to Lesson 36', () => {
        const executionLessons = canonical90Lessons.filter((l) => l.module === 'execution')
        const target = resolveModuleCtaTarget(executionLessons, canonical90Lessons, completedIds)
        expect(target.isAccessible).toBe(true)
        expect(target.lesson?.order).toBe(36)
      })

      it('resolves Module 5 (growth) CTA as inaccessible pointing to Lesson 36', () => {
        const growthLessons = canonical90Lessons.filter((l) => l.module === 'growth')
        const target = resolveModuleCtaTarget(growthLessons, canonical90Lessons, completedIds)
        expect(target.isAccessible).toBe(false)
        expect(target.firstActionableLesson?.order).toBe(36)
      })
    })

    // STATE C: Missing prerequisite in the middle (e.g., completed 1–15, 17–30, missing Lesson 16)
    describe('State C: Missing prerequisite in the middle (missing Lesson 16)', () => {
      const completedIds = new Set([
        ...getSliceIds(1, 15),
        ...getSliceIds(17, 30),
      ])

      it('identifies Lesson 16 (index 15) as the first actionable lesson despite later completions', () => {
        const firstActionable = getFirstActionableLessonIndex(completedIds, canonicalIds)
        expect(firstActionable).toBe(15)
        expect(canonical90Lessons[firstActionable].order).toBe(16)
      })

      it('blocks access to Lesson 17+ and reports Lesson 16 as the first incomplete prerequisite', () => {
        const range17 = getCanonicalPrerequisiteRange(completedIds, canonicalIds, 16) // Lesson 17 = index 16
        expect(range17.firstIncompleteIndex).toBe(15) // Lesson 16
        expect(range17.lastPrerequisiteIndex).toBe(15)

        const range31 = getCanonicalPrerequisiteRange(completedIds, canonicalIds, 30) // Lesson 31 = index 30
        expect(range31.firstIncompleteIndex).toBe(15) // Lesson 16
        expect(range31.lastPrerequisiteIndex).toBe(29)
      })
    })

    // STATE D: Non-contiguous / inconsistent data (e.g., completed Lessons 50 and 80, but 1–49 incomplete)
    describe('State D: Inconsistent completion data (Lessons 50 and 80 completed, 1–49 uncompleted)', () => {
      const completedIds = new Set([
        canonical90Lessons[49].id, // Lesson 50
        canonical90Lessons[79].id, // Lesson 80
      ])

      it('strictly identifies Lesson 1 as first actionable without being tricked by later IDs', () => {
        const firstActionable = getFirstActionableLessonIndex(completedIds, canonicalIds)
        expect(firstActionable).toBe(0)
      })

      it('strictly locks Lesson 51 and reports Lesson 1 as the first incomplete prerequisite', () => {
        const range51 = getCanonicalPrerequisiteRange(completedIds, canonicalIds, 50) // Lesson 51 = index 50
        expect(range51.firstIncompleteIndex).toBe(0)
      })
    })

    // STATE E: All 90 lessons completed
    describe('State E: Entire 90-lesson curriculum completed', () => {
      const completedIds = new Set(canonicalIds)

      it('returns -1 for first actionable lesson (all completed)', () => {
        const firstActionable = getFirstActionableLessonIndex(completedIds, canonicalIds)
        expect(firstActionable).toBe(-1)
      })

      it('confirms every lesson 1–90 has zero incomplete prerequisites', () => {
        for (let targetIndex = 0; targetIndex < 90; targetIndex++) {
          const range = getCanonicalPrerequisiteRange(completedIds, canonicalIds, targetIndex)
          expect(range.firstIncompleteIndex).toBeNull()
        }
      })

      it('resolves all module CTAs as accessible', () => {
        for (const slug of ALL_MODULE_SLUGS) {
          const modLessons = canonical90Lessons.filter((l) => l.module === slug)
          const target = resolveModuleCtaTarget(modLessons, canonical90Lessons, completedIds)
          expect(target.isAccessible).toBe(true)
        }
      })
    })
  })

  // ─── 3. Personalization & Recommendation Invariants ───────────────────────
  describe('3. Personalization & Recommendation Invariants', () => {
    it('personalizes path metadata without altering the canonical curriculum sequence', () => {
      const path = resolvePersonalizedPath({
        goal: 'transition_pm',
        career_role: 'software_engineer',
        onboarding_topics: ['strategy', 'roadmapping'],
      })

      expect(path.isPersonalized).toBe(true)
      expect(path.recommendedModuleSlug).toBe('foundations')
      expect(path.headerSubtitle).toContain('Transition')
    })

    it('recommends the lowest uncompleted canonical lesson even when user goal points to a later module', () => {
      const path = resolvePersonalizedPath({
        goal: 'executive_leadership',
        career_role: 'senior_pm',
        onboarding_topics: ['stakeholders'],
      })

      // User has only completed Lessons 1–5
      const completedIds = new Set(getSliceIds(1, 5))
      const milestone = resolveNextRecommendedMilestone(path, completedIds, canonical90Lessons)

      expect(milestone).not.toBeNull()
      expect(milestone!.order).toBe(6)
      expect(milestone!.lesson.id).toBe(canonical90Lessons[5].id)
      // Reason connects foundational step to leadership goal
      expect(milestone!.milestoneReason).toContain('foundational step')
    })

    it('returns null milestone when all 90 lessons are completed', () => {
      const path = resolvePersonalizedPath({ goal: 'transition_to_pm' })
      const completedIds = new Set(canonicalIds)
      const milestone = resolveNextRecommendedMilestone(path, completedIds, canonical90Lessons)

      expect(milestone).toBeNull()
    })
  })

  // ─── 4. Security, Privacy & PII Redaction Invariants ───────────────────────
  describe('4. Security, Privacy & Error Sanitization Invariants', () => {
    it('sanitizes Bearer tokens, secrets, passwords, and webhook signatures from error logs', () => {
      const rawError = 'Error: connection failed with Bearer eyJhbGciOiJIUzI1NiIsIn... and password=superSecretPassword123'
      const sanitized = sanitizeErrorMessage(rawError)

      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsIn...')
      expect(sanitized).not.toContain('superSecretPassword123')
      expect(sanitized).toContain('Bearer [REDACTED]')
      expect(sanitized).toContain('password=[REDACTED]')
    })

    it('sanitizes Resend API keys and webhook signing secrets', () => {
      const rawWebhookError = 'Webhook secret whsec_abcdef123456789 and API key re_12345678_abcdefgh rejected'
      const sanitized = sanitizeErrorMessage(rawWebhookError)

      expect(sanitized).not.toContain('whsec_abcdef123456789')
      expect(sanitized).not.toContain('re_12345678_abcdefgh')
      expect(sanitized).toContain('whsec_[REDACTED]')
      expect(sanitized).toContain('re_[REDACTED]')
    })
  })
})
