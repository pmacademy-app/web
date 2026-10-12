/**
 * Proof-nudge readout (Admin R6 / C1): treated vs holdout outcome rates for the two proof nudges.
 *
 * Pure: the caller loads the nudge rows from `notification_events` plus the outcome rows for
 * those users, and this module turns them into per-nudge rates. Rates are over distinct users.
 *
 * - `nudge.fellow_eligible`: a user converts when a `fellow_requests` row has `requested_at`
 *   within [first nudge row's created_at, + 14 days]. Applies to treated and held-out alike.
 * - `nudge.portfolio_ready`: a user converts when their portfolio is *currently* public. There is
 *   no published-at timestamp, so this outcome is not time-bound (the UI says so).
 *
 * Lift = treated rate − holdout rate. It needs a control: with nobody held out there is no
 * holdout rate to subtract, so lift is reported as not available (`liftAvailable: false`,
 * `lift: 0`) instead of the treated rate. A nudge is `ready` once it has at least
 * NUDGE_RETIRE_MIN_TREATED treated users, a non-empty holdout and a positive lift. When both nudges are ready
 * (`retireReady`), the manual campaign scripts they replace can be retired (decision B12).
 * The gate never retires the holdout itself: the holdout stays as the ongoing control.
 */
import { PROOF_NUDGE_KEYS, nudgeEventType, type ProofNudgeKey } from '@/lib/growth/proof-nudges'

export const NUDGE_RETIRE_MIN_TREATED = 200
export const NUDGE_OUTCOME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
export const NUDGE_HOLDOUT_REASON = 'nudge_holdout'

export interface NudgeEventRow {
  user_id: string
  event_type: string
  skipped_reason: string | null
  created_at: string
}

export interface FellowRequestRow {
  user_id: string
  requested_at: string
}

export interface AdminNudgeReadout {
  key: ProofNudgeKey
  name: string
  /** Distinct users who received the initial nudge. */
  sent: number
  /** Distinct users recorded in the holdout. */
  heldOut: number
  /** Distinct users who received the reminder. */
  reminded: number
  /** Share (0..1) of treated users who converted. */
  treatedRate: number
  /** Share (0..1) of held-out users who converted. */
  holdoutRate: number
  /** treatedRate − holdoutRate (can be negative). 0 when `liftAvailable` is false. */
  lift: number
  /** False when nobody is held out, so there is no control and `lift` is not a measurement. */
  liftAvailable?: boolean
  /** sent ≥ NUDGE_RETIRE_MIN_TREATED, a non-empty holdout and lift > 0: this nudge has proved itself. */
  ready: boolean
}

export interface NudgeReadoutInput {
  events: NudgeEventRow[]
  /** User ids whose portfolio is public right now. */
  publicUserIds: Iterable<string>
  fellowRequests: FellowRequestRow[]
  /** Display names per key; falls back to the key. */
  names?: Partial<Record<ProofNudgeKey, string>>
}

export interface NudgeReadoutResult {
  nudges: AdminNudgeReadout[]
  /** Both nudges are ready, so the manual campaign scripts can be retired. The holdout stays. */
  retireReady: boolean
}

/** Every event_type the readout reads (initial + reminder for each nudge). */
export const NUDGE_READOUT_EVENT_TYPES: string[] = PROOF_NUDGE_KEYS.flatMap((key) => [
  nudgeEventType(key, 'initial'),
  nudgeEventType(key, 'reminder'),
])

const rate = (converted: number, total: number) => (total > 0 ? converted / total : 0)

/** Earliest initial-row timestamp per user, for one nudge and one arm. */
function anchors(events: NudgeEventRow[], eventType: string, heldOut: boolean): Map<string, number> {
  const out = new Map<string, number>()
  for (const row of events) {
    if (row.event_type !== eventType) continue
    if ((row.skipped_reason === NUDGE_HOLDOUT_REASON) !== heldOut) continue
    if (!heldOut && row.skipped_reason !== null) continue
    const at = Date.parse(row.created_at)
    if (Number.isNaN(at)) continue
    const prev = out.get(row.user_id)
    if (prev === undefined || at < prev) out.set(row.user_id, at)
  }
  return out
}

export function computeNudgeReadout(input: NudgeReadoutInput): NudgeReadoutResult {
  const publicIds = new Set(input.publicUserIds)
  const requestsByUser = new Map<string, number[]>()
  for (const req of input.fellowRequests) {
    const at = Date.parse(req.requested_at)
    if (Number.isNaN(at)) continue
    const list = requestsByUser.get(req.user_id) ?? []
    list.push(at)
    requestsByUser.set(req.user_id, list)
  }

  const converted = (key: ProofNudgeKey, userId: string, anchor: number): boolean => {
    if (key === 'nudge.portfolio_ready') return publicIds.has(userId)
    return (requestsByUser.get(userId) ?? []).some((at) => at >= anchor && at <= anchor + NUDGE_OUTCOME_WINDOW_MS)
  }

  const nudges = PROOF_NUDGE_KEYS.map((key): AdminNudgeReadout => {
    const treated = anchors(input.events, nudgeEventType(key, 'initial'), false)
    const holdout = anchors(input.events, nudgeEventType(key, 'initial'), true)
    // A user is in one arm only; if bad data puts them in both, count them as held out.
    for (const id of holdout.keys()) treated.delete(id)

    const reminderType = nudgeEventType(key, 'reminder')
    const reminded = new Set(
      input.events.filter((r) => r.event_type === reminderType && r.skipped_reason === null).map((r) => r.user_id),
    )

    let treatedConverted = 0
    for (const [id, at] of treated) if (converted(key, id, at)) treatedConverted++
    let holdoutConverted = 0
    for (const [id, at] of holdout) if (converted(key, id, at)) holdoutConverted++

    const treatedRate = rate(treatedConverted, treated.size)
    const holdoutRate = rate(holdoutConverted, holdout.size)
    // An empty holdout would make holdoutRate 0 and the "lift" just the treated rate.
    const liftAvailable = holdout.size > 0
    const lift = liftAvailable ? treatedRate - holdoutRate : 0
    return {
      key,
      name: input.names?.[key] ?? key,
      sent: treated.size,
      heldOut: holdout.size,
      reminded: reminded.size,
      treatedRate,
      holdoutRate,
      lift,
      liftAvailable,
      ready: treated.size >= NUDGE_RETIRE_MIN_TREATED && liftAvailable && lift > 0,
    }
  })

  return { nudges, retireReady: nudges.every((n) => n.ready) }
}

/** Zeroed readout for empty data or a failed load. */
export function emptyNudgeReadout(names?: Partial<Record<ProofNudgeKey, string>>): NudgeReadoutResult {
  return computeNudgeReadout({ events: [], publicUserIds: [], fellowRequests: [], names })
}
