import crypto from 'crypto'

/**
 * Phase 4: re-cut the unit of work (Core path + optional Deep dive, trimmed quiz).
 *
 * This shipped as a 50/50 A/B experiment. Owner decision D5 (2026-10-20) makes the Core-lesson
 * recut ON permanently for every learner; it is no longer an experiment. What remains here is a
 * KILL SWITCH plus the deterministic assignment machinery, which is still useful if the owner ever
 * wants to run a partial split again:
 *
 *   - `RECUT_EXPERIMENT_ENABLED` unset (or any value other than 'false') means ON, and with the
 *     default 100% treatment share every signed-in learner gets the recut. Setting it to 'false'
 *     turns the recut off for everyone (full lesson + 15-question quiz) without a code deploy.
 *   - `RECUT_EXPERIMENT_TREATMENT_PCT` is still honoured (0 to 100) for a partial split.
 *   - Assignment is a pure function of a stable user id and the key, using the same construction
 *     as the lifecycle email holdouts (`lib/notifications/lifecycle/holdout.ts`). The server
 *     reconstructs the same variant everywhere it is needed (the lesson RSC that samples the quiz,
 *     the theory-read route that picks Core vs full reading time) with no cookie and no column.
 */

export type RecutVariant = 'control' | 'treatment'

export const RECUT_EXPERIMENT_KEY = 'recut_unit_of_work'

/** Default treatment share: 100%, so every signed-in learner gets the Core/Deep-dive recut (D5). */
export const DEFAULT_RECUT_TREATMENT_PERCENT = 100

export interface RecutExperimentConfig {
  enabled: boolean
  treatmentPercent: number
}

/**
 * Reads the kill switch from the environment (server-side). Unset means ON. Only the value
 * 'false' (case-insensitive, trimmed) turns the recut off, which makes everyone control.
 */
export function getRecutExperimentConfig(
  env: NodeJS.ProcessEnv = process.env
): RecutExperimentConfig {
  const enabled = (env.RECUT_EXPERIMENT_ENABLED ?? '').trim().toLowerCase() !== 'false'
  // A blank value is treated as unset: Number('') is 0, which would silently turn the recut off.
  const rawText = (env.RECUT_EXPERIMENT_TREATMENT_PCT ?? '').trim()
  const raw = rawText ? Number(rawText) : NaN
  const treatmentPercent =
    Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : DEFAULT_RECUT_TREATMENT_PERCENT
  return { enabled, treatmentPercent }
}

/**
 * Maps a user id to a stable bucket in [0, 99] for this key, using SHA-256 over
 * `"<key>:<userId>"` (same construction as the lifecycle holdout, so the two are independent
 * and neither correlates with the other).
 */
export function recutBucket(userId: string): number {
  const hash = crypto.createHash('sha256').update(`${RECUT_EXPERIMENT_KEY}:${userId}`).digest()
  return hash.readUInt32BE(0) % 100
}

/**
 * The variant a given user is in.
 *
 * @param userId  Stable user id. Anonymous/sample-lesson viewers (no id) are always control.
 * @param config  Kill switch + split. Defaults to reading the environment.
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
