/**
 * Daily email quota key — one definition, one timezone.
 *
 * The quota counter lives in `system_settings` under a date-stamped key
 * (`email_sent_count_YYYY_MM_DD`). That key was computed in two places with two
 * different clocks:
 *
 *   - `increment_daily_email_quota()` / `get_current_daily_email_count()` used
 *     `TO_CHAR(NOW(), 'YYYY_MM_DD')`, which resolves in the **Postgres session
 *     timezone**.
 *   - `EmailAutomationsService.getState()` used `new Date().toISOString()`, which is
 *     always **UTC**.
 *
 * Whenever the database session timezone is not UTC those two disagree for the offset
 * window every day. Enforcement stayed correct — the RPC computes the key once and
 * both increments and checks it — but the count an operator reads on the admin
 * dashboard came from a different row than the one being written. During an abuse
 * event that is exactly the wrong time to be looking at a stale zero.
 *
 * Policy: **the quota day is the UTC day**, on both sides. Migration
 * `20260908000002_quota_key_utc.sql` pins the SQL functions to UTC; this helper is the
 * single TypeScript definition. Do not inline the key format anywhere else.
 */

/** Formats the quota key for a given instant, always in UTC. */
export function dailyQuotaKeyForDate(date: Date): string {
  // `toISOString()` is UTC by definition, so this is timezone-stable regardless of
  // where the serverless instance runs.
  return `email_sent_count_${date.toISOString().slice(0, 10).replace(/-/g, '_')}`
}

/** Formats the quota key for the current UTC day. */
export function currentDailyQuotaKey(): string {
  return dailyQuotaKeyForDate(new Date())
}
