/**
 * Shared provider failure classification.
 *
 * Both email stacks — the direct `lib/email.ts` transport used by the Supabase Auth
 * hook, and the `ProviderRegistry` used by the queue processor — must agree on when a
 * failed send should be retried on the OTHER provider.
 *
 * The distinction is "can this provider accept the message right now?", NOT "was this
 * a 4xx?". Capacity exhaustion (402 no credits, 429 rate/quota, 408 request timeout)
 * is exactly what a second provider exists for: with Brevo primary, a spent daily
 * allowance otherwise takes signup verification and password reset down while a
 * healthy Resend key sits idle.
 *
 * Abuse containment does NOT live here. It lives in the pre-dispatch daily quota gate
 * in `processEmailQueue` and in signup rate limiting — both of which cap total volume
 * before a provider is ever called, and therefore cap failover volume too. Conflating
 * containment with failover eligibility is what produced the 2026-09-07 policy that
 * left Resend unused during Brevo quota exhaustion.
 */

export type ProviderFailureClass =
  /** The provider cannot accept this message now — try the other provider once. */
  | 'failover'
  /** Both providers would reject this identically — do not fail over, do not retry. */
  | 'permanent'
  /** Unrecognized failure — retry this provider later, but do not fail over. */
  | 'retry'

/** Provider is up but refusing this request for capacity reasons. */
const FAILOVER_STATUS_CODES = new Set([402, 408, 429])

/** Our payload, credentials, or configuration are wrong; the other provider gains nothing. */
const PERMANENT_STATUS_CODES = new Set([400, 401, 403, 404, 422])

/**
 * Classifies a failed provider send.
 *
 * `statusCode` absent means the request never produced an HTTP response at all
 * (DNS failure, connection refused, abort/timeout) — treated as `failover`, since the
 * provider is unreachable rather than refusing the content.
 */
export function classifyProviderFailure(statusCode?: number): ProviderFailureClass {
  if (typeof statusCode !== 'number' || Number.isNaN(statusCode) || statusCode <= 0) {
    return 'failover'
  }
  if (statusCode >= 500) return 'failover'
  if (FAILOVER_STATUS_CODES.has(statusCode)) return 'failover'
  if (PERMANENT_STATUS_CODES.has(statusCode)) return 'permanent'
  return 'retry'
}

/** Convenience predicate: should a failed send be attempted on the other provider? */
export function isFailoverEligible(statusCode?: number): boolean {
  return classifyProviderFailure(statusCode) === 'failover'
}
