import crypto from 'crypto'

/**
 * Phase 7 — Make the payoff visible: capstone eligibility-threshold experiment.
 *
 * PRODUCT_IMPROVEMENT_BLUEPRINT.md §7.2 ("Reconsider the 8-of-10 threshold"): the strongest
 * activation event in the product may be *producing a PM artifact*, not *finishing lessons*.
 * The blueprint calls for testing a lower threshold ("e.g. 4 lessons") for a cohort and
 * measuring whether earlier access to application produces more artifacts and better retention.
 *
 *   Control:   8 of 10 module lessons completed → capstone submission eligible (unchanged).
 *   Treatment: 4 of 10 module lessons completed → capstone submission eligible.
 *
 * NOTE ON SOURCE DOCS: the authoritative IMPLEMENTATION_PLAN.md Phase 7 does not itself carry
 * this experiment (its 7.2 is the review-SLA item and its DoD says "submission gating unchanged
 * (still 8 of 10)"). The experiment comes from the blueprint's §7.2. The Phase 7 task combines
 * both, so this module implements the experiment while the plan's control behaviour (8 of 10)
 * remains the default. The plan/blueprint divergence is recorded in
 * docs/decisions/ADR-009-phase-7-make-payoff-visible.md.
 *
 * There is no general experiment platform in this repo. Per the plan's standing instruction to
 * "reuse the existing mechanism" and "implement only the smallest phase-specific mechanism
 * required", this mirrors the proven deterministic pattern used by the Phase 6 module-entry
 * unlock (`lib/academy/module-entry-unlock.ts`) and the Phase 4 recut (`lib/academy/experiment.ts`):
 *
 *   - Assignment is a pure function of a stable user id + the experiment key, so the SERVER
 *     reconstructs the same variant everywhere it is needed (the eligibility gate in
 *     `capstones-db.ts`, the status display, and offline analysis) with no cookie and no column.
 *   - The flag DEFAULTS TO CONTROL: unless `CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED=true`, every
 *     learner is `control` and the existing 8-of-10 gate is enforced unchanged. Enabling the flag
 *     is the whole rollout; disabling it is the whole rollback — no code deploy.
 *   - The cohort is restricted to NEW SIGNUPS via `CAPSTONE_THRESHOLD_COHORT_START` (an ISO date).
 *     Learners created before it are always control, so the experiment never *removes* capstone
 *     access from the existing base. Cohort membership is derived from `users.created_at`, which
 *     already exists — no new state.
 *
 * Safety property: the treatment threshold is LOWER than control, so a treated learner is only
 * ever granted eligibility EARLIER, never later. No learner — treatment or control — can lose
 * access they already had, and existing capstone progress/submissions are untouched (the gate
 * only guards *new* draft/submission creation).
 */

export type CapstoneThresholdVariant = 'control' | 'treatment'

export const CAPSTONE_THRESHOLD_KEY = 'capstone_threshold'

/** The unchanged, plan-authoritative control gate: 8 of 10 module lessons. */
export const CONTROL_REQUIRED_LESSONS = 8

/** The blueprint's treatment gate ("e.g. 4 lessons"). */
export const DEFAULT_TREATMENT_REQUIRED_LESSONS = 4

/** Default split when the experiment is enabled. The cohort is already narrowed to new signups
 * by the start date, so the default rolls the treatment out to the whole cohort; set
 * `CAPSTONE_THRESHOLD_TREATMENT_PCT` to run a partial split within it. */
export const DEFAULT_CAPSTONE_THRESHOLD_TREATMENT_PERCENT = 100

export interface CapstoneThresholdConfig {
  enabled: boolean
  treatmentPercent: number
  /** Lessons required to be eligible under treatment (must be ≤ control). */
  treatmentRequiredLessons: number
  /** Epoch ms; learners created strictly before this are always control. null = no cohort gate. */
  cohortStartMs: number | null
}

/**
 * Reads the experiment flag from the environment (server-side). Absent/false ⇒ disabled ⇒
 * everyone is control at the 8-of-10 gate — the safe default the plan mandates.
 */
export function getCapstoneThresholdConfig(
  env: NodeJS.ProcessEnv = process.env
): CapstoneThresholdConfig {
  const enabled = env.CAPSTONE_THRESHOLD_EXPERIMENT_ENABLED === 'true'

  const rawPct = Number(env.CAPSTONE_THRESHOLD_TREATMENT_PCT)
  const treatmentPercent =
    Number.isFinite(rawPct) && rawPct >= 0 && rawPct <= 100
      ? rawPct
      : DEFAULT_CAPSTONE_THRESHOLD_TREATMENT_PERCENT

  const rawThreshold = Number(env.CAPSTONE_THRESHOLD_TREATMENT_LESSONS)
  // Clamp defensively: the treatment must be a positive integer and never exceed control
  // (a "treatment" that raised the bar would silently reduce access — refuse it and fall back).
  const treatmentRequiredLessons =
    Number.isInteger(rawThreshold) && rawThreshold >= 1 && rawThreshold <= CONTROL_REQUIRED_LESSONS
      ? rawThreshold
      : DEFAULT_TREATMENT_REQUIRED_LESSONS

  const rawStart = (env.CAPSTONE_THRESHOLD_COHORT_START || '').trim()
  let cohortStartMs: number | null = null
  if (rawStart) {
    const parsed = Date.parse(rawStart)
    if (Number.isFinite(parsed)) cohortStartMs = parsed
  }

  return { enabled, treatmentPercent, treatmentRequiredLessons, cohortStartMs }
}

/**
 * Maps a user id to a stable bucket in [0, 99], using SHA-256 over
 * `"<experimentKey>:<userId>"` — the same construction as the module-entry unlock and the recut,
 * so the three experiments are independent and none correlates with the others.
 */
export function capstoneThresholdBucket(userId: string): number {
  const hash = crypto.createHash('sha256').update(`${CAPSTONE_THRESHOLD_KEY}:${userId}`).digest()
  return hash.readUInt32BE(0) % 100
}

export interface CapstoneThresholdUser {
  id: string | null | undefined
  /** ISO timestamp of account creation (users.created_at). Null/undefined ⇒ treated as
   * outside the cohort when a cohort start is configured. */
  createdAt?: string | null
}

/**
 * The variant a given learner is in.
 *
 * Control unless ALL hold: the flag is enabled, the learner has a stable id, the learner was
 * created on/after the cohort start (when one is set), and their deterministic bucket falls
 * under the treatment percentage.
 */
export function getCapstoneThresholdVariant(
  user: CapstoneThresholdUser | null | undefined,
  config: CapstoneThresholdConfig = getCapstoneThresholdConfig()
): CapstoneThresholdVariant {
  if (!config.enabled) return 'control'
  if (!user?.id) return 'control'

  // Cohort gate: only learners created on/after the start date are eligible for treatment.
  if (config.cohortStartMs !== null) {
    if (!user.createdAt) return 'control'
    const createdMs = Date.parse(user.createdAt)
    if (!Number.isFinite(createdMs) || createdMs < config.cohortStartMs) return 'control'
  }

  const pct = Math.max(0, Math.min(100, config.treatmentPercent))
  if (pct <= 0) return 'control'
  if (pct >= 100) return 'treatment'
  return capstoneThresholdBucket(user.id) < pct ? 'treatment' : 'control'
}

/**
 * The number of completed module lessons a learner needs before the capstone becomes eligible.
 * Control (and every disabled/out-of-cohort case) ⇒ 8; treatment ⇒ the configured lower value.
 *
 * This is the single source of truth for the gate — `capstones-db.ts` and `capstones.ts` both
 * derive their threshold from here so UI and server enforcement can never drift.
 */
export function getRequiredLessonsForVariant(
  variant: CapstoneThresholdVariant,
  config: CapstoneThresholdConfig = getCapstoneThresholdConfig()
): number {
  return variant === 'treatment' ? config.treatmentRequiredLessons : CONTROL_REQUIRED_LESSONS
}

/** Convenience: the required-lessons gate for a specific learner. */
export function getRequiredLessonsForUser(
  user: CapstoneThresholdUser | null | undefined,
  config: CapstoneThresholdConfig = getCapstoneThresholdConfig()
): number {
  return getRequiredLessonsForVariant(getCapstoneThresholdVariant(user, config), config)
}
