/**
 * Capstone Business Logic & Utilities (Phase 3 Sprint 1)
 *
 * Pure validation and status calculation functions for module capstones.
 * Independent of database and UI state.
 */

import { getCapstoneDefinition } from '@/config/capstones'

export type CapstoneStatus = 'locked' | 'unlocked' | 'draft' | 'submitted' | 'reviewed'

/**
 * Phase 7 (7.3) — honest capstone review expectation.
 *
 * Capstone review is manual admin work with no staffed, guaranteed turnaround (there is no SLA the
 * operational workflow can currently promise, and `capstone_submissions` has no reviewer-assignment
 * or due-by machinery). The plan is explicit: "If no real SLA can be guaranteed … do not invent a
 * promise. Instead, make the UI expectation explicit and honest." So this copy sets an accurate
 * expectation rather than a deadline, and makes clear that submission is *already* complete and
 * valuable (portfolio + XP) whether or not a review lands — preventing the "I submitted my best
 * work and now nothing happens" failure. It is centralised so the submission modal, the workspace
 * and any notification copy stay consistent, and so a real SLA (if the business later commits to
 * one) is a one-line change here.
 */
export const CAPSTONE_REVIEW_EXPECTATION = {
  heading: 'What happens after you submit',
  /** The reassurance that submission stands on its own. */
  outcome:
    'Your deliverable is saved to your portfolio and your XP is awarded the moment you submit — nothing else is required for it to count.',
  /** The honest turnaround statement — deliberately no guaranteed window. */
  reviewNote:
    'Capstone reviews are done manually by the Prodily team. We read every submission, but review timing is best-effort and not guaranteed — so there is no need to wait on feedback before moving to the next module.',
  /** Compact one-liner for tight surfaces. */
  short:
    'Saved to your portfolio and XP awarded immediately. Reviews are manual and best-effort — no need to wait to keep learning.',
} as const

export interface CapstoneValidationResult {
  isValid: boolean
  wordCount: number
  characterCount: number
  minWordCount: number
  missingRequirements: string[]
  reason?: string
}

/**
 * Calculates word count and character count from text or markdown string.
 */
export function calculateCapstoneWordCount(content: string): { wordCount: number; characterCount: number } {
  if (!content) return { wordCount: 0, characterCount: 0 }
  
  // Strip markdown formatting symbols for accurate word count
  const plainText = content
    .replace(/#+\s+/g, '') // headers
    .replace(/\*+/g, '') // bold/italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '') // code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/>\s+/g, '') // quotes
    .trim()

  const words = plainText ? plainText.split(/\s+/).filter(Boolean) : []
  return {
    wordCount: words.length,
    characterCount: content.length,
  }
}

/**
 * Validates capstone submission text against module requirements.
 */
export function validateCapstoneSubmission(
  moduleSlug: string,
  content: string
): CapstoneValidationResult {
  const def = getCapstoneDefinition(moduleSlug)
  const minWords = def?.minWordCount ?? 250

  const { wordCount, characterCount } = calculateCapstoneWordCount(content)
  const missingRequirements: string[] = []

  if (wordCount < minWords) {
    missingRequirements.push(`Minimum ${minWords} words required (currently ${wordCount} words).`)
  }

  // Check key headings if defined in starter template
  if (def?.requirements) {
    for (const req of def.requirements) {
      // Check if content mentions key requirement terms (case-insensitive)
      const term = req.label.toLowerCase().replace(/[^a-z0-9]/g, ' ')
      const mainWords = term.split(' ').filter((w) => w.length > 3)
      if (mainWords.length > 0) {
        const matches = mainWords.some((w) => content.toLowerCase().includes(w))
        if (!matches) {
          missingRequirements.push(`Missing section or mention of "${req.label}".`)
        }
      }
    }
  }

  const isValid = missingRequirements.length === 0

  return {
    isValid,
    wordCount,
    characterCount,
    minWordCount: minWords,
    missingRequirements,
    reason: isValid ? undefined : missingRequirements.join(' '),
  }
}

/**
 * Evaluates the status of a capstone submission based on submission row and module completed lessons count.
 *
 * `requiredLessons` is the eligibility gate. It defaults to 8 (the plan-authoritative control
 * value, so every existing caller and test keeps its exact behaviour) but is parametrised for the
 * Phase 7 threshold experiment: the treatment cohort passes a lower value resolved server-side
 * from `lib/capstone-threshold-experiment.ts`. UI and server enforcement therefore share one gate
 * and cannot drift.
 */
export function deriveCapstoneStatus(
  submissionStatus?: string | null,
  moduleLessonsCompleted: number = 0,
  requiredLessons: number = 8
): CapstoneStatus {
  if (submissionStatus === 'submitted') return 'submitted'
  if (submissionStatus === 'reviewed') return 'reviewed'
  if (submissionStatus === 'draft') return 'draft'

  // Capstone is unlocked once the learner has completed at least `requiredLessons` of the
  // module's lessons.
  if (moduleLessonsCompleted >= requiredLessons) {
    return 'unlocked'
  }

  return 'locked'
}

export interface CapstoneTransitionResult {
  allowed: boolean
  reason?: string
}

/**
 * Validates whether a capstone status transition is permitted for a given actor.
 * Prevents illegal state transitions such as reverting submitted capstones to draft
 * or non-admins marking submissions as reviewed.
 */
export function validateCapstoneTransition(
  currentStatus: string | null | undefined,
  targetStatus: string,
  actor: 'learner' | 'admin'
): CapstoneTransitionResult {
  const normCurrent = currentStatus ? currentStatus.toLowerCase().trim() : 'unlocked'
  const normTarget = targetStatus.toLowerCase().trim()

  if (actor === 'learner') {
    // Learners can only move to 'draft' or 'submitted'
    if (normTarget === 'draft') {
      if (normCurrent === 'submitted' || normCurrent === 'reviewed') {
        return {
          allowed: false,
          reason: 'Cannot revert a submitted or reviewed capstone back to draft.',
        }
      }
      return { allowed: true }
    }

    if (normTarget === 'submitted') {
      if (normCurrent === 'reviewed') {
        return {
          allowed: false,
          reason: 'Cannot resubmit an already reviewed capstone.',
        }
      }
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: `Learners cannot transition capstone to "${targetStatus}".`,
    }
  }

  if (actor === 'admin') {
    if (normTarget === 'reviewed') {
      if (normCurrent === 'draft') {
        return {
          allowed: false,
          reason: 'Cannot review a draft capstone that has not been submitted.',
        }
      }
      return { allowed: true }
    }

    if (normTarget === 'draft') {
      // Admin can reset a submission back to draft for learner revisions
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: `Admins cannot transition capstone to "${targetStatus}".`,
    }
  }

  return { allowed: false, reason: 'Invalid actor specified.' }
}
