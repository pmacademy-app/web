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
 * ## Why the 2026-09-09 failover still did not fire
 *
 * The rules above were already correct for HTTP status codes, and 402/429 were
 * already classified `failover`. What broke is that Brevo does not reliably signal
 * credit exhaustion with a distinct status: `POST /v3/smtp/email` answers with an
 * ordinary **HTTP 400** carrying `{"code":"not_enough_credits"}` in the body. This
 * module only ever saw the status code — and 400 means "both providers would reject
 * this identically", i.e. `permanent` — so the healthy Resend key was never tried.
 * The provider's own error code is now part of the input, and a capacity code
 * outranks whatever status carried it.
 *
 * Abuse containment does NOT live here. It lives in the governed email gateway
 * (`lib/email/governance.ts`), the pre-dispatch quota gates, and signup rate limiting
 * — all of which cap total volume before a provider is ever called, and therefore cap
 * failover volume too. Conflating containment with failover eligibility is what
 * produced the 2026-09-07 policy that left Resend unused during Brevo exhaustion.
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
 * Provider-specific error codes that mean "out of capacity", whatever HTTP status
 * they arrive with. Matched case-insensitively as substrings because both providers
 * have shipped several spellings of the same condition.
 *
 * Brevo:  not_enough_credits, plan limit / daily limit reached
 * Resend: rate_limit_exceeded, daily_quota_exceeded
 */
const CAPACITY_ERROR_CODE_FRAGMENTS = [
  'not_enough_credit',
  'not enough credit',
  'insufficient_credit',
  'insufficient credit',
  'out_of_credit',
  'credits_exhausted',
  'plan_limit',
  'plan limit',
  'daily_limit',
  'daily limit',
  'sending_limit',
  'sending limit',
  'quota_exceeded',
  'quota exceeded',
  'over_quota',
  'rate_limit',
  'rate limit',
  'too_many_requests',
  'throttl',
]

/**
 * True when a provider's own error code/message reports capacity exhaustion rather
 * than a problem with our request.
 *
 * Deliberately narrow: it matches capacity vocabulary only. A generic "Bad Request"
 * or "invalid email" stays permanent, so this cannot degrade into "every 4xx fails
 * over" — the failure mode the 2026-09-07 change was written to prevent.
 */
export function isCapacityExhaustionSignal(statusCode?: number, providerCode?: string | null): boolean {
  if (statusCode === 402 || statusCode === 429) return true
  if (!providerCode) return false
  const haystack = providerCode.toLowerCase()
  return CAPACITY_ERROR_CODE_FRAGMENTS.some((fragment) => haystack.includes(fragment))
}

/**
 * Classifies a failed provider send.
 *
 * `statusCode` absent means the request never produced an HTTP response at all
 * (DNS failure, connection refused, abort/timeout) — treated as `failover`, since the
 * provider is unreachable rather than refusing the content.
 *
 * `providerCode` is the provider's own error code or message. When it reports
 * capacity exhaustion it wins over the status code, which is what lets a Brevo
 * `400 not_enough_credits` fail over to Resend instead of being read as a permanent
 * bad-request.
 */
export function classifyProviderFailure(statusCode?: number, providerCode?: string | null): ProviderFailureClass {
  // Capacity is checked first and on purpose: it is the one condition where the
  // status code actively misdescribes the failure.
  if (isCapacityExhaustionSignal(statusCode, providerCode)) return 'failover'
  if (typeof statusCode !== 'number' || Number.isNaN(statusCode) || statusCode <= 0) {
    return 'failover'
  }
  if (statusCode >= 500) return 'failover'
  if (FAILOVER_STATUS_CODES.has(statusCode)) return 'failover'
  if (PERMANENT_STATUS_CODES.has(statusCode)) return 'permanent'
  return 'retry'
}

/** Convenience predicate: should a failed send be attempted on the other provider? */
export function isFailoverEligible(statusCode?: number, providerCode?: string | null): boolean {
  return classifyProviderFailure(statusCode, providerCode) === 'failover'
}
