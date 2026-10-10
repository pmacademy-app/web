/**
 * Proof nudges (Growth R5 / B6, B7): "your portfolio is ready, make it public" and "you qualify
 * for PM Fellow". Pure planning; `proof-nudges-run.ts` reads and sends.
 *
 * Each nudge goes to a learner at most twice: once, then one reminder at least seven days later
 * if it still applies. Learners in the deterministic 30% holdout (per nudge) get neither, so the
 * effect can be measured, exactly like the lifecycle sequences.
 */
import type { ProofState } from './proof-state'

export const PROOF_NUDGE_KEYS = ['nudge.portfolio_ready', 'nudge.fellow_eligible'] as const
export type ProofNudgeKey = (typeof PROOF_NUDGE_KEYS)[number]

export const NUDGE_REMINDER_AFTER_MS = 7 * 24 * 60 * 60 * 1000

/** What has already happened for one (learner, nudge), from notification_events. */
export interface NudgeHistory {
  /** When the first nudge was sent, or null. */
  sentAt: string | null
  remindedAt: string | null
  /** Held out of this nudge (recorded once; never sent). */
  heldOut: boolean
}

export const EMPTY_NUDGE_HISTORY: NudgeHistory = { sentAt: null, remindedAt: null, heldOut: false }

/** notification_events.event_type for each round. */
export const nudgeEventType = (key: ProofNudgeKey, round: 'initial' | 'reminder') =>
  round === 'initial' ? key : `${key}.reminder`

/** Stable id per learner, nudge and round: the email and in-app writes dedupe on it. */
export const nudgeIdempotencyKey = (key: ProofNudgeKey, userId: string, round: 'initial' | 'reminder') =>
  round === 'initial' ? `${key}-${userId}` : `${key}-${userId}-r1`

/**
 * The nudges that apply to a learner now, in priority order. The Fellow nudge is only for learners
 * who never had a request decided: not after a rejection (they can see and re-request in Settings,
 * and an unprompted "you qualify" reads badly), and not after an approval (that learner was a
 * Fellow; if they are not one now, the status was revoked). A Fellow granted and revoked by an
 * admin with no request leaves no trace here, so that rare case can still be nudged.
 */
export function applicableNudges(state: ProofState): ProofNudgeKey[] {
  const nudges: ProofNudgeKey[] = []
  if (state.portfolio.readyButPrivate) nudges.push('nudge.portfolio_ready')
  if (
    state.fellowState === 'eligible' &&
    state.latestFellowRequestStatus !== 'rejected' &&
    state.latestFellowRequestStatus !== 'approved'
  ) {
    nudges.push('nudge.fellow_eligible')
  }
  return nudges
}

/** Which round of a nudge to send now, or null when it has run its course or is not due. */
export function nudgeRoundDue(history: NudgeHistory, now: Date): 'initial' | 'reminder' | null {
  if (history.heldOut || history.remindedAt) return null
  if (!history.sentAt) return 'initial'
  return now.getTime() - Date.parse(history.sentAt) >= NUDGE_REMINDER_AFTER_MS ? 'reminder' : null
}
