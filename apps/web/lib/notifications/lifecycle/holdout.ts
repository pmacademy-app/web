import crypto from 'crypto'

/**
 * Deterministic holdout bucketing for new lifecycle sequences (Phase 1, Step 8).
 *
 * Every genuinely new lifecycle sequence ships with a ~30% holdout so its effect on
 * D14 return can be measured against a comparable, untreated group. The requirements:
 *
 *   - ~70% of eligible users receive the sequence, ~30% are held out.
 *   - Assignment is STABLE per (user, sequence): a user never oscillates between
 *     treatment and holdout across scheduler runs, because the bucket is a pure
 *     function of a stable user identifier and the sequence key — no randomness, no
 *     stored experiment state, nothing that changes on re-execution.
 *   - Different sequences bucket independently (the sequence key is part of the hash),
 *     so a user held out of one sequence is not automatically held out of another.
 *
 * Because assignment is deterministic, the holdout group can be reconstructed at
 * analysis time from the same inputs — no separate experimentation platform or extra
 * persistence is required. Treatment sends are directly observable in `email_queue`
 * (by template_key); holdout users are recorded as `notification_events` rows with a
 * `lifecycle_holdout:<key>` reason for auditability.
 */

/** Default share of eligible users withheld from a new lifecycle sequence. */
export const DEFAULT_LIFECYCLE_HOLDOUT_PERCENT = 30

/**
 * Maps a (userId, sequenceKey) pair to a stable bucket in the range [0, 99].
 *
 * Uses SHA-256 over `"<sequenceKey>:<userId>"` and reads the first 4 bytes as an
 * unsigned integer, then mod 100. SHA-256 distributes uniformly, so bucket values are
 * evenly spread and the boundary at `holdoutPercent` yields ~that fraction of users.
 */
export function lifecycleBucket(userId: string, sequenceKey: string): number {
  const hash = crypto.createHash('sha256').update(`${sequenceKey}:${userId}`).digest()
  // First 4 bytes as a big-endian unsigned 32-bit integer.
  const value = hash.readUInt32BE(0)
  return value % 100
}

/**
 * Returns `true` when the user is in the holdout group for the given sequence and must
 * NOT receive the lifecycle email being tested. Holdout users remain eligible for all
 * normal product behaviour (daily reminder, recap, in-app, etc.) — only the specific
 * new sequence is withheld.
 *
 * @param holdoutPercent Share held out, 0..100. Defaults to 30. `0` disables the
 *   holdout entirely (everyone is treated); `100` holds everyone out.
 */
export function isLifecycleHoldout(
  userId: string,
  sequenceKey: string,
  holdoutPercent: number = DEFAULT_LIFECYCLE_HOLDOUT_PERCENT
): boolean {
  const clamped = Math.max(0, Math.min(100, holdoutPercent))
  if (clamped <= 0) return false
  if (clamped >= 100) return true
  return lifecycleBucket(userId, sequenceKey) < clamped
}
