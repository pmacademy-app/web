/**
 * Lifecycle sequence segmentation (Phase 1.5).
 *
 * Three sequences reconnect the return path for users who signed up but never built a
 * learning habit. Each is a pure, deterministic classification over a snapshot of data
 * that already exists in the product (users + user_lesson_progress + the streak
 * fields) — no new state is introduced.
 *
 *   A — D+1 Never Started      : signed up ~1 day ago, no learning progress at all.
 *   B — D+3 Started, Not Done  : signed up ~3 days ago, began a lesson but has not yet
 *                                completed the first milestone (any completed lesson).
 *   C — Streak Broken → Quiet  : previously built a streak, it broke, and they have
 *                                since gone quiet (~3 days without activity).
 *
 * Each user is assigned to AT MOST ONE sequence per run (see `resolveLifecycleSequence`)
 * so a single scheduler execution never sends the same person two lifecycle emails.
 */

export type LifecycleSequenceKey =
  | 'lifecycle.d1_never_started'
  | 'lifecycle.d3_started_not_finished'
  | 'lifecycle.streak_broken'

/** Signup-age window (days) for the D+1 never-started sequence. */
export const D1_MIN_AGE_DAYS = 1
export const D1_MAX_AGE_DAYS = 2

/** Signup-age window (days) for the D+3 started-but-not-finished sequence. */
export const D3_MIN_AGE_DAYS = 3
export const D3_MAX_AGE_DAYS = 4

/** A previously-active learner counts as "quiet" once this many days pass with no activity. */
export const STREAK_BROKEN_QUIET_MIN_DAYS = 3
export const STREAK_BROKEN_QUIET_MAX_DAYS = 4

/**
 * Minimum longest-ever streak that marks a learner as having genuinely built a habit.
 * Guards Sequence C against firing for users who never established a streak at all.
 */
export const STREAK_BROKEN_MIN_LONGEST_STREAK = 2

/**
 * Minimal snapshot needed to classify a user into a lifecycle sequence. Every field is
 * read from existing tables (`users` + aggregates over `user_lesson_progress`).
 */
export interface LifecycleUserSnapshot {
  /** users.created_at (ISO timestamp). */
  createdAt: string
  /** users.current_streak. */
  currentStreak: number
  /** users.longest_streak. */
  longestStreak: number
  /** users.last_streak_date — local YYYY-MM-DD of last streak-qualifying activity, or null. */
  lastStreakDate: string | null
  /** Has at least one `user_lesson_progress` row (started any lesson). */
  hasAnyProgress: boolean
  /** Has at least one `user_lesson_progress` row with status 'completed' (first milestone reached). */
  hasCompletedLesson: boolean
  /** The user's local date (YYYY-MM-DD) at evaluation time — used for the quiet-window math. */
  localDate: string
}

/** Whole-day difference between two YYYY-MM-DD local date strings (`a - b`), or null if unparseable. */
export function daysBetweenLocalDates(a: string, b: string): number | null {
  const parse = (s: string): number | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    if (!m) return null
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const am = parse(a)
  const bm = parse(b)
  if (am === null || bm === null) return null
  return Math.round((am - bm) / (24 * 60 * 60 * 1000))
}

/** Signup age in fractional days relative to `nowUtc`. */
export function signupAgeDays(createdAt: string, nowUtc: Date): number {
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY
  return (nowUtc.getTime() - created) / (24 * 60 * 60 * 1000)
}

/** A — signed up ~1 day ago and has never started a lesson. */
export function qualifiesD1NeverStarted(snap: LifecycleUserSnapshot, nowUtc: Date): boolean {
  const age = signupAgeDays(snap.createdAt, nowUtc)
  return age >= D1_MIN_AGE_DAYS && age < D1_MAX_AGE_DAYS && !snap.hasAnyProgress
}

/** B — signed up ~3 days ago, started a lesson, but has not completed the first milestone. */
export function qualifiesD3StartedNotFinished(snap: LifecycleUserSnapshot, nowUtc: Date): boolean {
  const age = signupAgeDays(snap.createdAt, nowUtc)
  return (
    age >= D3_MIN_AGE_DAYS &&
    age < D3_MAX_AGE_DAYS &&
    snap.hasAnyProgress &&
    !snap.hasCompletedLesson
  )
}

/** C — previously built a streak (>= 2), it is now broken (0), and they have gone quiet. */
export function qualifiesStreakBroken(snap: LifecycleUserSnapshot): boolean {
  if (snap.currentStreak !== 0) return false
  if (snap.longestStreak < STREAK_BROKEN_MIN_LONGEST_STREAK) return false
  if (!snap.lastStreakDate) return false
  const quietDays = daysBetweenLocalDates(snap.localDate, snap.lastStreakDate)
  if (quietDays === null) return false
  return quietDays >= STREAK_BROKEN_QUIET_MIN_DAYS && quietDays < STREAK_BROKEN_QUIET_MAX_DAYS
}

/**
 * Assigns a user to at most one lifecycle sequence. Evaluated in chronological order
 * (D+1 → D+3 → streak-broken); the windows are effectively disjoint (a 1-day-old
 * account cannot have built a 2-day streak), so the ordering only ever matters as a
 * safety net against an unexpected overlap. Returns `null` when the user matches none.
 */
export function resolveLifecycleSequence(
  snap: LifecycleUserSnapshot,
  nowUtc: Date
): LifecycleSequenceKey | null {
  if (qualifiesD1NeverStarted(snap, nowUtc)) return 'lifecycle.d1_never_started'
  if (qualifiesD3StartedNotFinished(snap, nowUtc)) return 'lifecycle.d3_started_not_finished'
  if (qualifiesStreakBroken(snap)) return 'lifecycle.streak_broken'
  return null
}
