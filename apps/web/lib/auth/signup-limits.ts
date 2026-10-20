/**
 * Platform-wide signup ceiling per hour, shared by every path that creates an account
 * (the email signup route and the Google OAuth callback).
 *
 * This is the layer that stops a campaign rotating both IPs and addresses, because
 * the key is constant: rotation buys nothing. The threshold is derived from the
 * operator's own configured daily email allowance rather than invented: signups are
 * the dominant consumer of that allowance, so one hour's share of it is the honest
 * ceiling. The floor keeps a conservatively-configured limit from blocking a normal
 * day's organic signups (baseline before the incident was 1-49 signups/day).
 *
 * One bucket for both signup methods on purpose: a second, Google-only bucket would
 * double the effective ceiling.
 */

export const SIGNUP_GLOBAL_LIMIT_KEY = 'signup_global'
export const AGGREGATE_SIGNUP_WINDOW_MS = 60 * 60 * 1000
export const AGGREGATE_SIGNUP_FLOOR = 15

export function aggregateSignupCeiling(dailyEmailLimit: number): number {
  const derived = Math.ceil((Number.isFinite(dailyEmailLimit) && dailyEmailLimit > 0 ? dailyEmailLimit : 100) / 24)
  return Math.max(AGGREGATE_SIGNUP_FLOOR, derived)
}
