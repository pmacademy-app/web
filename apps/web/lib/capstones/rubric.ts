import { z } from 'zod'

import {
  getCapstoneDefinition,
  getCapstoneForModule,
  type CapstoneRequirement,
} from '@/config/capstones'

export type RubricScores = Record<string, number>

/**
 * Zod validation schema for capstone review submissions.
 * - action: 'approve' | 'reject' | 'request_changes'
 * - scores: Record mapping requirement IDs to integer scores (0..3)
 * - feedback: Required string for 'reject' or 'request_changes', optional for 'approve'
 */
export const capstoneReviewSchema = z
  .object({
    action: z.enum(['approve', 'reject', 'request_changes']),
    scores: z.record(z.string(), z.number()),
    feedback: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action === 'reject' || data.action === 'request_changes') {
      if (!data.feedback || data.feedback.trim().length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Feedback is required when rejecting or requesting changes.',
          path: ['feedback'],
        })
      }
    }
  })

export type CapstoneReviewInput = z.infer<typeof capstoneReviewSchema>

export interface RubricValidationResult {
  valid: boolean
  error?: string
  expectedRequirements?: CapstoneRequirement[]
}

/**
 * Validates requirement scores for a given module capstone:
 * 1. Resolves capstone definition for the module from config/capstones.ts.
 * 2. Ensures no unknown requirement IDs are included in scores.
 * 3. Ensures every requirement defined for the module has a score.
 * 4. Ensures each score is an integer between 0 and 3.
 */
export function validateRubricScores(
  moduleSlug: string,
  scores: Record<string, number>
): RubricValidationResult {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    return {
      valid: false,
      error: 'Scores must be an object mapping requirement IDs to integer scores.',
    }
  }

  const definition = getCapstoneForModule(moduleSlug) ?? getCapstoneDefinition(moduleSlug)
  if (!definition) {
    return {
      valid: false,
      error: `Unknown capstone module: "${moduleSlug}".`,
    }
  }

  const expectedRequirements = definition.requirements
  const expectedIdSet = new Set(expectedRequirements.map((r) => r.id))
  const scoreKeys = Object.keys(scores)

  // 1. Check for unknown requirement IDs
  for (const key of scoreKeys) {
    if (!expectedIdSet.has(key)) {
      return {
        valid: false,
        error: `Unknown requirement ID: "${key}".`,
      }
    }
  }

  // 2. Check for missing requirement IDs and valid integer scores in range 0..3
  for (const req of expectedRequirements) {
    if (!(req.id in scores)) {
      return {
        valid: false,
        error: `Missing score for requirement: "${req.id}".`,
      }
    }
    const score = scores[req.id]
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 3) {
      return {
        valid: false,
        error: `Score for requirement "${req.id}" must be an integer between 0 and 3.`,
      }
    }
  }

  return {
    valid: true,
    expectedRequirements,
  }
}
