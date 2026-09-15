/**
 * Structured error taxonomy for operational failures.
 *
 * On-call questions this exists to answer, in order:
 *   1. What failed, and is it still retrying on its own?
 *   2. Which provider / dependency caused it?
 *   3. Which user or queue item was affected?
 *   4. What should the operator actually do about it?
 *
 * The old shape answered none of these reliably: `severity` was assigned by hand at
 * each call site (every Brevo blip was `critical`, while a permanent bad-key 401 from
 * the auth hook was `warning`), and the only machine-readable dimension was an 8-value
 * `category`. Everything else lived in an interpolated English sentence.
 *
 * Two rules make this useful rather than decorative:
 *   - `severity` is DERIVED from `kind`, never passed in. Consistency across call
 *     sites is what makes severity filterable.
 *   - `summary` is a STABLE sentence with no ids, emails, or counts in it. Ids belong
 *     in `subject`. Fingerprints are built from the summary, so an id in the string
 *     gives every occurrence its own fingerprint and defeats deduplication — which is
 *     how a single provider outage turns into an alert storm.
 */

// ─── Dimensions ───────────────────────────────────────────────────────────────

/** Which subsystem the failure belongs to. */
export type ErrorDomain =
  | 'email'
  | 'auth'
  | 'queue'
  | 'admin'
  | 'db'
  | 'webhook'
  | 'cron'
  | 'api'

/** What kind of failure it was — the primary axis for triage. */
export type FailureKind =
  /** Provider refused for capacity/credit reasons (402/429). Needs a human. */
  | 'provider_quota'
  /** Provider is down or unreachable (5xx, DNS, connection refused). */
  | 'provider_outage'
  /** Provider did not answer in time. */
  | 'provider_timeout'
  /** Provider rejected the message itself (bad recipient, invalid payload). */
  | 'provider_rejected'
  /** A required key, secret, or migration is missing. */
  | 'config_missing'
  /** Authentication or authorization was refused. */
  | 'auth_failed'
  /** The database could not be reached or a required query failed. */
  | 'db_unavailable'
  /** Input failed validation. */
  | 'validation'
  /** Anything not otherwise classified. */
  | 'unexpected'

/** Whether the system will recover on its own. */
export type Retryability =
  /** The system will retry automatically; no action unless it persists. */
  | 'auto_retrying'
  /** Recoverable, but only if an operator retries it. */
  | 'manual_retry'
  /** Will not succeed on retry; needs a fix. */
  | 'terminal'

export type ErrorSeverity = 'critical' | 'error' | 'warning'

// ─── Derived severity ─────────────────────────────────────────────────────────

/**
 * Severity per failure kind. Never assign severity at a call site — a Brevo timeout
 * that the queue will retry is not the same urgency as an exhausted Brevo quota that
 * stops all mail until someone tops it up, even though both surface as "Brevo failed".
 */
const SEVERITY_BY_KIND: Record<FailureKind, ErrorSeverity> = {
  provider_quota: 'critical', // mail stops until a human acts
  provider_outage: 'warning', // escalates to critical when every provider is down
  provider_timeout: 'warning', // usually self-heals on the next attempt
  provider_rejected: 'error', // this message will never send as-is
  config_missing: 'critical', // a key or migration is absent in production
  auth_failed: 'warning', // mostly rejected probes; a spike is what matters
  db_unavailable: 'critical',
  validation: 'error',
  unexpected: 'error',
}

const RETRYABILITY_BY_KIND: Record<FailureKind, Retryability> = {
  provider_quota: 'terminal',
  provider_outage: 'auto_retrying',
  provider_timeout: 'auto_retrying',
  provider_rejected: 'terminal',
  config_missing: 'terminal',
  auth_failed: 'terminal',
  db_unavailable: 'manual_retry',
  validation: 'terminal',
  unexpected: 'manual_retry',
}

/** Default operator guidance. Call sites may override with something more specific. */
const NEXT_ACTION_BY_KIND: Record<FailureKind, string> = {
  provider_quota:
    'Provider capacity is exhausted. Top up the provider plan, or switch PRIMARY_EMAIL_PROVIDER to the other provider.',
  provider_outage:
    'Provider is unavailable. Failover handles single-provider outages; act only if both providers are failing or this persists.',
  provider_timeout:
    'Provider is slow or unreachable. Watch for a sustained rate before acting — single timeouts are retried automatically.',
  provider_rejected:
    'The provider rejected this message. Check the recipient address and the rendered payload; retrying unchanged will fail again.',
  config_missing:
    'A required environment variable, secret, or database migration is missing in this environment. Check deployment configuration.',
  auth_failed:
    'A request failed authentication. Investigate only on a sustained spike, which may indicate credential rotation or abuse.',
  db_unavailable:
    'A required database operation failed. Check Supabase availability and connection limits, then retry the affected operation.',
  validation: 'Input failed validation. Fix the caller or the payload; this will not succeed on retry.',
  unexpected: 'Unclassified failure. Inspect the sanitized details for the underlying error.',
}

/**
 * Resolves severity for a kind.
 *
 * `allProvidersFailed` is the one documented escalation: a single provider outage is
 * routine and covered by failover, but losing every provider means mail is stopped.
 */
export function deriveSeverity(
  kind: FailureKind,
  opts?: { allProvidersFailed?: boolean }
): ErrorSeverity {
  if (opts?.allProvidersFailed && (kind === 'provider_outage' || kind === 'provider_timeout')) {
    return 'critical'
  }
  return SEVERITY_BY_KIND[kind] ?? 'error'
}

export function deriveRetryability(kind: FailureKind): Retryability {
  return RETRYABILITY_BY_KIND[kind] ?? 'manual_retry'
}

export function defaultNextAction(kind: FailureKind): string {
  return NEXT_ACTION_BY_KIND[kind] ?? NEXT_ACTION_BY_KIND.unexpected
}

/**
 * Maps a provider HTTP status onto a failure kind.
 *
 * Related to but deliberately separate from `classifyProviderFailure()` in
 * `lib/notifications/providers`: that one answers "should we fail over?", this one
 * answers "what do we tell the operator?". Keeping them apart avoids a dependency
 * from the monitoring layer into the notification layer.
 */
export function classifyProviderFailureKind(statusCode?: number, isTimeout?: boolean): FailureKind {
  if (isTimeout) return 'provider_timeout'
  if (typeof statusCode !== 'number' || Number.isNaN(statusCode) || statusCode <= 0) {
    return 'provider_outage' // never reached the provider at all
  }
  if (statusCode === 408 || statusCode === 504) return 'provider_timeout'
  if (statusCode === 402 || statusCode === 429) return 'provider_quota'
  if (statusCode === 401 || statusCode === 403) return 'config_missing' // bad or revoked API key
  if (statusCode >= 500) return 'provider_outage'
  if (statusCode >= 400) return 'provider_rejected'
  return 'unexpected'
}

// ─── Report shape ─────────────────────────────────────────────────────────────

/** Identifiers for the thing the failure happened to. Never part of the fingerprint. */
export interface ErrorSubject {
  userId?: string
  queueId?: string
  broadcastId?: string
  templateKey?: string
  /** Recipient address, already masked by the caller (see `maskEmail`). */
  maskedEmail?: string
}

/** Which external dependency was involved, and how it answered. */
export interface ErrorProviderContext {
  name: string
  statusCode?: number
  externalId?: string
  /** 1 for the primary attempt, 2 for a failover attempt. */
  attempt?: number
}

/**
 * A single operational failure, in the shape the admin console and alerting consume.
 *
 * `severity` is intentionally absent — it is derived from `kind` at write time.
 */
export interface ErrorReport {
  domain: ErrorDomain
  kind: FailureKind
  /** Stable machine-ish name, e.g. 'email.send', 'queue.dead_letter', 'admin.retry_all'. */
  operation: string
  /** Stable one-line description. No ids, emails, counts, or timestamps. */
  summary: string
  subject?: ErrorSubject
  provider?: ErrorProviderContext
  /** Overrides the kind's default. */
  retryability?: Retryability
  /** Overrides the kind's default guidance. */
  nextAction?: string
  /** Every provider failed — escalates outage/timeout severity. */
  allProvidersFailed?: boolean
  /** Free-form diagnostic context. Sanitized before it is persisted. */
  details?: Record<string, unknown>
  /**
   * The originating request's correlation id (B9-B).
   *
   * Recorded in `details` rather than as a column so no migration is needed, and
   * deliberately kept out of the fingerprint — an id that changes per request would
   * make every occurrence hash differently and defeat deduplication, which is the
   * same failure mode `stabilizeForFingerprint` exists to prevent.
   */
  requestId?: string
}

/** An `ErrorReport` with every derived field filled in. */
export interface ResolvedErrorReport extends ErrorReport {
  severity: ErrorSeverity
  retryability: Retryability
  nextAction: string
}

export function resolveErrorReport(report: ErrorReport): ResolvedErrorReport {
  return {
    ...report,
    severity: deriveSeverity(report.kind, { allProvidersFailed: report.allProvidersFailed }),
    retryability: report.retryability ?? deriveRetryability(report.kind),
    nextAction: report.nextAction ?? defaultNextAction(report.kind),
  }
}

/**
 * Legacy `category` value for a report.
 *
 * `system_errors.category` predates this taxonomy and the admin console filters on it,
 * so it keeps working: email failures report the provider name (which is what an
 * operator filters by), everything else reports its domain.
 */
export function categoryForReport(report: Pick<ErrorReport, 'domain' | 'provider'>): string {
  if (report.domain === 'email' && report.provider?.name) {
    const name = report.provider.name.toLowerCase()
    if (name === 'brevo' || name === 'resend') return name
  }
  return report.domain
}
