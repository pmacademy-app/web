import { evaluateAndAwardBadges } from '@/lib/badges-db'
import { logSystemError } from '@/lib/monitoring/logger'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * ISSUE-23: re-evaluates a learner's badges after an XP award, so XP-driven badges are granted
 * at the moment they are earned rather than on the next unrelated evaluation.
 *
 * Call inside after() from a route, for example `after(() => evaluateBadgesAfterXp(userId))`,
 * so the evaluation never delays or fails the learner's response. In lib code, await it.
 *
 * Never throws: a failed evaluation (client, query or award error) is logged with
 * logSystemError and swallowed. Badge awards are idempotent, so the next evaluation catches up.
 */
export async function evaluateBadgesAfterXp(userId: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await evaluateAndAwardBadges(supabase, userId)
  } catch (err) {
    try {
      await logSystemError({
        severity: 'warning',
        category: 'system',
        operation: 'badges_evaluate_after_xp',
        message: `Badge evaluation after XP award failed: ${err instanceof Error ? err.message : String(err)}`,
        userId,
      })
    } catch {
      // Logging is best effort; the helper must never throw.
    }
  }
}
