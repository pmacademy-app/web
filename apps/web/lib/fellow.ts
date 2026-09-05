/**
 * PM Fellow Request — pure eligibility & state derivation logic.
 *
 * Eligibility criterion (v1): reuses the existing portfolio-readiness checklist's
 * 100% completion signal (`completedCount === totalCount`, i.e. every essential AND
 * recommended item complete) rather than inventing a separate Fellow checklist.
 * This is a deliberately higher bar than the "ready to share" threshold, appropriate
 * for a Fellow distinction.
 */

import type { PortfolioReadinessSummary } from './portfolio-readiness'

export type FellowRequestRowStatus = 'pending' | 'approved' | 'rejected'

export type FellowRequestUiState = 'not_eligible' | 'eligible' | 'pending' | 'approved' | 'rejected'

export interface FellowRequestStateInput {
  isFellow: boolean
  readiness: PortfolioReadinessSummary
  latestRequestStatus: FellowRequestRowStatus | null
}

export interface FellowRequestState {
  state: FellowRequestUiState
  canSubmit: boolean
  isEligible: boolean
}

/**
 * A portfolio is Fellow-eligible only once every readiness checklist item —
 * essential AND recommended — is complete (the "100%" signal).
 */
export function isFellowEligible(readiness: PortfolioReadinessSummary): boolean {
  return readiness.totalCount > 0 && readiness.completedCount === readiness.totalCount
}

/**
 * Derives the user-facing Fellow request state from current eligibility, existing
 * Fellow status, and the most recent request's status (if any).
 */
export function deriveFellowRequestState(input: FellowRequestStateInput): FellowRequestState {
  const isEligible = isFellowEligible(input.readiness)

  // Admin-granted or previously-approved Fellow status always wins, regardless of
  // current readiness (readiness could regress after approval without revoking status).
  if (input.isFellow) {
    return { state: 'approved', canSubmit: false, isEligible }
  }

  if (input.latestRequestStatus === 'pending') {
    return { state: 'pending', canSubmit: false, isEligible }
  }

  if (input.latestRequestStatus === 'rejected') {
    // A previously-rejected user may re-request once they become eligible again.
    return { state: isEligible ? 'eligible' : 'rejected', canSubmit: isEligible, isEligible }
  }

  return { state: isEligible ? 'eligible' : 'not_eligible', canSubmit: isEligible, isEligible }
}
