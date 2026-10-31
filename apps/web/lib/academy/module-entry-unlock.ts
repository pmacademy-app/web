import crypto from 'crypto'

/**
 * Phase 6 (Make the Path Real): module-entry unlock assignment.
 *
 * The global sequential lock is replaced by a module-entry unlock model: every module's first
 * lesson is reachable, and lessons stay sequential *within* a module. This shipped as a cohort
 * experiment. Owner decision D5 (2026-10-20) makes module-entry unlock ON permanently for every
 * learner; it is no longer an experiment. What remains here is a KILL SWITCH plus the
 * deterministic assignment machinery:
 *
 *   - `MODULE_ENTRY_UNLOCK_ENABLED` unset (or any value other than 'false') means ON, and with
 *     the default 100% treatment share and no cohort start every signed-in learner is treated.
 *     Setting it to 'false' restores the global-sequential lock for everyone without a deploy.
 *   - `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` and `MODULE_ENTRY_UNLOCK_COHORT_START` are still
 *     honoured when set, so a partial split or a new-signups-only rollout stays possible.
 *   - Assignment is a pure function of a stable user id and the key (same construction as the
 *     Phase 4 recut in `lib/academy/experiment.ts` and the lifecycle email holdouts), so the
 *     server reconstructs the same variant everywhere it is needed (the lesson gate, the Academy
 *     list, the Search overlay) with no cookie and no column.
 *
 * Rollback safety (grandfathering) is NOT handled here: it lives in `curriculum-access.ts`,
 * which grants access to any lesson the learner has already opened regardless of variant, so
 * a treated learner who opened a module-entry lesson keeps it if the kill switch is later used.
 */

export type ModuleEntryUnlockVariant = 'control' | 'treatment'

export const MODULE_ENTRY_UNLOCK_KEY = 'module_entry_unlock'

/** Default treatment share: 100%, so every eligible learner is treated (D5). Set
 * `MODULE_ENTRY_UNLOCK_TREATMENT_PCT` only to run a partial split again. */
export const DEFAULT_MODULE_ENTRY_TREATMENT_PERCENT = 100

export interface ModuleEntryUnlockConfig {
  enabled: boolean
  treatmentPercent: number
  /** Epoch ms; learners created strictly before this are always control. null = no cohort gate. */
  cohortStartMs: number | null
}

/**
 * Reads the kill switch from the environment (server-side). Unset means ON. Only the value
 * 'false' (case-insensitive, trimmed) turns module-entry unlock off, which makes everyone control.
 */
export function getModuleEntryUnlockConfig(
  env: NodeJS.ProcessEnv = process.env
): ModuleEntryUnlockConfig {
  const enabled = (env.MODULE_ENTRY_UNLOCK_ENABLED ?? '').trim().toLowerCase() !== 'false'

  // A blank value is treated as unset: Number('') is 0, which would silently turn the unlock off.
  const rawPctText = (env.MODULE_ENTRY_UNLOCK_TREATMENT_PCT ?? '').trim()
  const rawPct = rawPctText ? Number(rawPctText) : NaN
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
 * Maps a user id to a stable bucket in [0, 99], using SHA-256 over `"<key>:<userId>"`: the
 * same construction as the recut and the lifecycle holdout, so the three are independent and
 * none correlates with the others.
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
 * Control unless ALL hold: the kill switch is off, the learner has a stable id, the learner was
 * created on/after the cohort start (when one is set), and their deterministic bucket falls
 * under the treatment percentage.
 *
 * @param user   Stable id + created_at. Anonymous/sample viewers (no id) are always control.
 * @param config Kill switch + split + cohort start. Defaults to reading the environment.
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

/** Convenience: does this learner get module-entry unlock? */
export function isModuleEntryUnlockTreatment(
  user: ModuleEntryUnlockUser | null | undefined,
  config?: ModuleEntryUnlockConfig
): boolean {
  return getModuleEntryUnlockVariant(user, config) === 'treatment'
}
