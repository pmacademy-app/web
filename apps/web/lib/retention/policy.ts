/**
 * The retention policy (B9-D).
 *
 * ## Where these numbers come from
 *
 * Every window below is taken verbatim from **L-11** in
 * `docs/FINAL_IMPLEMENTATION_PLAN.md`, which is where the policy was decided:
 *
 * > completed queue records 30d · dead letters 90d · delivery logs 90d ·
 * > system errors 90d · operational telemetry 30d · security/abuse events 180d ·
 * > admin audit logs 180d · aggregate non-PII analytics long-term.
 * > **Active legal/incident holds override automatic deletion.**
 *
 * Nothing here is invented, and nothing is rounded. A window that does not appear
 * in L-11 means that table is not swept — absence is a decision, not an oversight.
 *
 * ## What is deliberately never deleted
 *
 * `admin_audit_logs` — L-11 gives it 180 days, but B9-D's scope note is explicit
 * that it is **not in scope for deletion**: a security review needs it, and the
 * cost of keeping it is trivial next to the cost of not having it. It is absent
 * from this file on purpose. Do not add it without a decision that says to.
 *
 * `system_settings` — configuration, not telemetry. Only the dated
 * `email_sent_count_YYYY_MM_DD` counters are swept, and those are matched by key
 * shape rather than by age, so a misparse can never reach a real setting.
 */

/** A table swept on a timestamp column. */
export interface RetentionRule {
  /** Stable id for reporting; also the log event suffix. */
  id: string
  table: string
  /** Column the age is measured on. */
  timestampColumn: string
  /** Primary key used to batch deletes. */
  idColumn: string
  /** Retention window in days, from L-11. */
  days: number
  /** One-line justification, quoting the policy line it comes from. */
  reason: string
  /** Restricts the sweep to these values of `statusColumn`. */
  statusColumn?: string
  statusIn?: string[]
  statusNotIn?: string[]
  /** Restricts by incident category, for the two different system_errors windows. */
  categoryIn?: string[]
  categoryNotIn?: string[]
  /** False for tables with no hold column (see the migration for why). */
  supportsHold: boolean
}

/**
 * Incident categories treated as security/abuse events.
 *
 * L-11 keeps these 180 days rather than the 90 an ordinary operational error
 * gets, because they are the records an abuse or breach investigation reads, and
 * an investigation usually starts well after the events it is about. Drawn from
 * `ErrorCategory` in `lib/monitoring/logger.ts`: `auth` covers failed
 * authentication and the hook's rejected-signature incidents, `webhook` covers
 * rejected provider callbacks, `verification` covers the email-verification path.
 */
export const SECURITY_CATEGORIES = ['auth', 'verification', 'webhook'] as const

/** Queue rows that have reached a terminal, successful-or-skipped state. */
export const COMPLETED_QUEUE_STATUSES = ['sent', 'delivered', 'skipped', 'suppressed'] as const

/** Queue rows that gave up. L-11 keeps these three times longer than a success. */
export const DEAD_LETTER_QUEUE_STATUSES = ['dead_letter', 'failed'] as const

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    id: 'email_queue.completed',
    table: 'email_queue',
    timestampColumn: 'updated_at',
    idColumn: 'id',
    days: 30,
    reason: 'L-11: completed queue records 30d',
    statusColumn: 'status',
    statusIn: [...COMPLETED_QUEUE_STATUSES],
    supportsHold: true,
  },
  {
    id: 'email_queue.dead_letter',
    table: 'email_queue',
    timestampColumn: 'updated_at',
    idColumn: 'id',
    days: 90,
    reason: 'L-11: dead letters 90d',
    statusColumn: 'status',
    statusIn: [...DEAD_LETTER_QUEUE_STATUSES],
    supportsHold: true,
  },
  {
    id: 'email_delivery_events',
    table: 'email_delivery_events',
    timestampColumn: 'occurred_at',
    idColumn: 'id',
    days: 90,
    reason: 'L-11: delivery logs 90d',
    supportsHold: true,
  },
  {
    id: 'system_errors.operational',
    table: 'system_errors',
    timestampColumn: 'timestamp',
    idColumn: 'id',
    days: 90,
    reason: 'L-11: system errors 90d',
    categoryNotIn: [...SECURITY_CATEGORIES],
    supportsHold: true,
  },
  {
    id: 'system_errors.security',
    table: 'system_errors',
    timestampColumn: 'timestamp',
    idColumn: 'id',
    days: 180,
    reason: 'L-11: security/abuse events 180d',
    categoryIn: [...SECURITY_CATEGORIES],
    supportsHold: true,
  },
  {
    id: 'notification_events',
    table: 'notification_events',
    timestampColumn: 'created_at',
    idColumn: 'id',
    days: 30,
    reason: 'L-11: operational telemetry 30d',
    supportsHold: true,
  },
  {
    id: 'user_notification_timeline',
    table: 'user_notification_timeline',
    timestampColumn: 'created_at',
    idColumn: 'id',
    days: 30,
    reason: 'L-11: operational telemetry 30d',
    supportsHold: true,
  },
  {
    id: 'rate_limits',
    table: 'rate_limits',
    timestampColumn: 'last_requested_at',
    idColumn: 'key',
    days: 30,
    reason: 'L-11: operational telemetry 30d',
    // No hold column: a rate-limit bucket is not something anyone places a legal
    // hold on, and its rows are dead within minutes of their window closing.
    supportsHold: false,
  },
]

/** The dated daily-counter keys in `system_settings`, e.g. `email_sent_count_2026_09_15`. */
export const DAILY_COUNTER_KEY_PATTERN = /^email_sent_count_(\d{4})_(\d{2})_(\d{2})$/

/** Daily counters are operational telemetry: 30 days, same as the rest. */
export const DAILY_COUNTER_RETENTION_DAYS = 30

/** The cutoff instant for a window, measured back from `now`. */
export function cutoffFor(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

/**
 * Whether a dated counter key is old enough to sweep.
 *
 * Returns false for anything that is not exactly the dated-counter shape, so a
 * real setting (`email_automations`, `feature_flags`) can never be matched by a
 * loose prefix. The date is parsed as UTC to match `daily-quota-key.ts`, which
 * `20260908000002_quota_key_utc.sql` pinned to UTC.
 */
export function isExpiredDailyCounterKey(key: string, now: Date = new Date()): boolean {
  const match = DAILY_COUNTER_KEY_PATTERN.exec(key)
  if (!match) return false

  const [, year, month, day] = match
  const keyDate = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
  if (Number.isNaN(keyDate.getTime())) return false

  // Measured from the END of the counter's day, not its start. A counter labelled
  // `2026_08_16` covers activity up to 2026-08-17T00:00Z, so at midday on day 30 it
  // is still describing something inside the window. Comparing the start instead
  // would delete each counter about half a day early — small, but the wrong
  // direction for a rule whose deletions are recoverable only from backup.
  const dayEnd = new Date(keyDate.getTime() + 24 * 60 * 60 * 1000)

  return dayEnd < cutoffFor(DAILY_COUNTER_RETENTION_DAYS, now)
}
