import crypto from 'crypto'

/**
 * Phase 6 — Make the Path Real: module-entry unlock experiment assignment.
 *
 * IMPLEMENTATION_PLAN.md §"Phase 6": the global sequential lock is replaced by a
 * module-entry unlock model (every module's first lesson is reachable; lessons stay
 * sequential *within* a module). The plan flags the real downside — unlocking multiple
 * entry points may scatter learners and reduce total completion — so the new rule must be
 * cohort-tested and revert without a deploy.
 *
 * There is no general experiment platform in this repo. Per the plan's instruction to
 * "prefer an existing mechanism" and "implement only the smallest phase-specific mechanism
 * required", this mirrors the proven deterministic pattern already used for the Phase 4
 * quiz recut (`lib/academy/experiment.ts`) and the lifecycle email holdouts:
 *
 *   - Assignment is a pure function of a stable user id + the experiment key, so the SERVER
 *     reconstructs the same variant everywhere it is needed (the lesson gate, the Academy
 *     list, the Search overlay, and offline analysis) with no cookie and no column.
 *   - The flag DEFAULTS TO CONTROL: unless `MODULE_ENTRY_UNLOCK_ENABLED=true`, every learner
 *     is `control` and sees the unchanged global-sequential curriculum. Enabling the flag is
 *     the whole rollout; disabling it is the whole rollback — no code deploy.
 *   - The cohort is restricted to NEW SIGNUPS via `MODULE_ENTRY_UNLOCK_COHORT_START` (an ISO
 *     date). Users created before it are always control, so the experiment never changes the
 *     experience of the existing base. Cohort membership is derived from `users.created_at`,
 *     which already exists — no new state.
 *
 * Rollback safety (grandfathering) is NOT handled here: it lives in `curriculum-access.ts`,
 * which grants access to any lesson the learner has already opened regardless of variant, so
 * a treatment learner who opened a module-entry lesson keeps it if the flag is later disabled.
 */

export type ModuleEntryUnlockVariant = 'control' | 'treatment'

export const MODULE_ENTRY_UNLOCK_KEY = 'module_entry_unlock'

/** Default split when the experiment is enabled. The cohort is already narrowed to new
 * signups by the start date, so the default rolls the treatment out to the whole cohort;
 * set `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` to run a partial split within it. */
export const DEFAULT_MODULE_ENTRY_TREATMENT_PERCENT = 100

export interface ModuleEntryUnlockConfig {
  enabled: boolean
  treatmentPercent: number
  /** Epoch ms; learners created strictly before this are always control. null = no cohort gate. */
  cohortStartMs: number | null
}

/**
 * Reads the experiment flag from the environment (server-side). Absent/false ⇒ disabled ⇒
 * everyone is control — the safe default the plan mandates for the merge-to-main gate.
 */
export function getModuleEntryUnlockConfig(
  env: NodeJS.ProcessEnv = process.env
): ModuleEntryUnlockConfig {
  const enabled = env.MODULE_ENTRY_UNLOCK_ENABLED === 'true'

  const rawPct = Number(env.MODULE_ENTRY_UNLOCK_TREATMENT_PCT)
  const treatmentPercent =
    Number.isFinite(rawPct) && rawPct >= 0 && rawPct <= 100
      ? rawPct
      : DEFAULT_MODULE_ENTRY_TREATMENT_PERCENT

  const rawStart = (env.MODULE_ENTRY_UNLOCK_COHORT_START || '').trim()
  let cohortStartMs: number | null = null
  if (rawStart) {
    const parsed = Date.parse(rawStart)
    if (Number.isFinite(parsed)) cohortStartMs = parsed
  }

  return { enabled, treatmentPercent, cohortStartMs }
}

/**
 * Maps a user id to a stable bucket in [0, 99], using SHA-256 over
 * `"<experimentKey>:<userId>"` — the same construction as the recut experiment and the
 * lifecycle holdout, so the three are independent and none correlates with the others.
 */
export function moduleEntryUnlockBucket(userId: string): number {
  const hash = crypto.createHash('sha256').update(`${MODULE_ENTRY_UNLOCK_KEY}:${userId}`).digest()
  return hash.readUInt32BE(0) % 100
}

export interface ModuleEntryUnlockUser {
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
 *
 * @param user   Stable id + created_at. Anonymous/sample viewers (no id) are always control.
 * @param config Experiment flag + split + cohort start. Defaults to reading the environment.
 */
export function getModuleEntryUnlockVariant(
  user: ModuleEntryUnlockUser | null | undefined,
  config: ModuleEntryUnlockConfig = getModuleEntryUnlockConfig()
): ModuleEntryUnlockVariant {
  if (!config.enabled) return 'control'
  if (!user?.id) return 'control'

  // Cohort gate: only learners created on/after the start date are eligible.
  if (config.cohortStartMs !== null) {
    if (!user.createdAt) return 'control'
    const createdMs = Date.parse(user.createdAt)
    if (!Number.isFinite(createdMs) || createdMs < config.cohortStartMs) return 'control'
  }

  const pct = Math.max(0, Math.min(100, config.treatmentPercent))
  if (pct <= 0) return 'control'
  if (pct >= 100) return 'treatment'
  return moduleEntryUnlockBucket(user.id) < pct ? 'treatment' : 'control'
}

/** Convenience: is this learner in the module-entry unlock treatment? */
export function isModuleEntryUnlockTreatment(
  user: ModuleEntryUnlockUser | null | undefined,
  config?: ModuleEntryUnlockConfig
): boolean {
  return getModuleEntryUnlockVariant(user, config) === 'treatment'
}
