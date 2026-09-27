import crypto from 'crypto'

/**
 * Phase 4 — Re-cut the unit of work: A/B experiment assignment.
 *
 * IMPLEMENTATION_PLAN.md §"Phase 4 → Experiment design" (E2): the recut ships as a true
 * 50/50 randomised split on new signups — the only phase that changes the perceived
 * product rather than repairing a broken flow — and its rollback plan requires the split
 * to be "feature-flagged so it reverts without a deploy" with the flag "defaulting to
 * control".
 *
 * There is no general experiment platform in this repo, so — per the plan's instruction to
 * "implement only the smallest phase-specific mechanism required" — this mirrors the
 * proven deterministic pattern already used for lifecycle email holdouts
 * (`lib/notifications/lifecycle/holdout.ts`):
 *
 *   - Assignment is a pure function of a stable user id and the experiment key. A learner
 *     never oscillates between control and treatment across requests; no experiment state
 *     is persisted anywhere.
 *   - Because it is deterministic, the SERVER can reconstruct the same variant in every
 *     place that needs it (the lesson RSC that samples the quiz, the theory-read route that
 *     picks Core vs full reading time for the gate, and offline analysis of who saw what)
 *     without threading a cookie or writing a column.
 *   - The flag DEFAULTS TO CONTROL: unless `RECUT_EXPERIMENT_ENABLED=true`, every learner is
 *     `control` and sees the unchanged full lesson + 15-question quiz. Enabling the flag is
 *     the whole rollout, and disabling it is the whole rollback — no deploy of code.
 */

export type RecutVariant = 'control' | 'treatment'

export const RECUT_EXPERIMENT_KEY = 'recut_unit_of_work'

/** Default split when the experiment is enabled: 50% treatment (the Core/Deep-dive recut). */
export const DEFAULT_RECUT_TREATMENT_PERCENT = 50

export interface RecutExperimentConfig {
  enabled: boolean
  treatmentPercent: number
}

/**
 * Reads the experiment flag from the environment (server-side). Absent/false ⇒ disabled ⇒
 * everyone is control, which is the safe default the plan mandates for the merge-to-main
 * gate ("flag defaults to control").
 */
export function getRecutExperimentConfig(
  env: NodeJS.ProcessEnv = process.env
): RecutExperimentConfig {
  const enabled = env.RECUT_EXPERIMENT_ENABLED === 'true'
  const raw = Number(env.RECUT_EXPERIMENT_TREATMENT_PCT)
  const treatmentPercent =
    Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_RECUT_TREATMENT_PERCENT
  return { enabled, treatmentPercent }
}

/**
 * Maps a user id to a stable bucket in [0, 99] for this experiment, using SHA-256 over
 * `"<experimentKey>:<userId>"` (same construction as the lifecycle holdout, so the two are
 * independent and neither correlates with the other).
 */
export function recutBucket(userId: string): number {
  const hash = crypto.createHash('sha256').update(`${RECUT_EXPERIMENT_KEY}:${userId}`).digest()
  return hash.readUInt32BE(0) % 100
}

/**
 * The variant a given user is in.
 *
 * @param userId  Stable user id. Anonymous/sample-lesson viewers (no id) are always control.
 * @param config  Experiment flag + split. Defaults to reading the environment.
 */
export function getRecutVariant(
  userId: string | null | undefined,
  config: RecutExperimentConfig = getRecutExperimentConfig()
): RecutVariant {
  if (!config.enabled) return 'control'
  if (!userId) return 'control'
  const pct = Math.max(0, Math.min(100, config.treatmentPercent))
  if (pct <= 0) return 'control'
  if (pct >= 100) return 'treatment'
  return recutBucket(userId) < pct ? 'treatment' : 'control'
}

/** Convenience: is this user in the recut (Core/Deep-dive) treatment? */
export function isRecutTreatment(
  userId: string | null | undefined,
  config?: RecutExperimentConfig
): boolean {
  return getRecutVariant(userId, config) === 'treatment'
}
