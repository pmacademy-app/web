/**
 * Capstone Business Logic & Utilities (Phase 3 Sprint 1)
 *
 * Pure validation and status calculation functions for module capstones.
 * Independent of database and UI state.
 */

import { getCapstoneDefinition } from '@/config/capstones'

export type CapstoneStatus = 'locked' | 'unlocked' | 'draft' | 'submitted' | 'reviewed'

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
 */
export function deriveCapstoneStatus(
  submissionStatus?: string | null,
  moduleLessonsCompleted: number = 0
): CapstoneStatus {
  if (submissionStatus === 'submitted') return 'submitted'
  if (submissionStatus === 'reviewed') return 'reviewed'
  if (submissionStatus === 'draft') return 'draft'

  // Capstone is unlocked if user has completed at least 8 of 10 lessons in the module,
  // or if module 1 capstone (foundations) is unlocked.
  if (moduleLessonsCompleted >= 8) {
    return 'unlocked'
  }

  return 'locked'
}
