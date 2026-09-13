import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Constant-time secret comparison.
 *
 * Extracted so there is one implementation rather than a per-call-site variant.
 * `resolveActor` compares the cron secret with it, and the Supabase auth hook
 * compares its shared secret with it.
 *
 * **Why hash first.** `timingSafeEqual` throws when the two buffers differ in
 * length, and the obvious guard — comparing lengths first — leaks the secret's
 * length through timing and through the early return. Hashing both sides to a
 * fixed 32 bytes removes the length channel entirely, and SHA-256 preimage
 * resistance means the digest comparison is as strong as comparing the values.
 *
 * This is for comparing a caller-supplied secret against one we hold. It is not a
 * password hash, and it is not a substitute for HMAC signature verification where
 * a signature scheme already exists.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(a, b)
}

/**
 * True when `provided` equals any of `candidates`, compared in constant time.
 *
 * Every candidate is evaluated — the loop deliberately does not short-circuit on
 * a match, so the work done does not depend on which variant matched or on how
 * many were checked before it.
 */
export function secretMatchesAny(provided: string, candidates: readonly string[]): boolean {
  let matched = false
  for (const candidate of candidates) {
    if (secretsMatch(provided, candidate)) matched = true
  }
  return matched
}
