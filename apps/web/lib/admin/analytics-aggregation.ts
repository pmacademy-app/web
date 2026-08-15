import { clampPct } from './users-aggregation'
import type { AdminStreakBucket } from './types'

/**
 * Pure aggregation helpers for the Phase 4 Learning Analytics workspace.
 *
 * These functions contain NO database access — they transform raw row arrays
 * (xp events, user profiles, module progress) into analytics-ready shapes so
 * the math can be unit-tested in isolation. The service layer
 * (`CurriculumService`) is responsible for fetching the raw rows.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * DAU / WAU / MAU — distinct learners with XP activity in the trailing
 * 24h / 7d / 30d windows ending at `now`.
 *
 * These are trailing-window snapshots (the standard definition) rather than
 * range-scoped counts, so they stay meaningful regardless of the selected
 * range preset. `xpEvents` should cover at least the last 30 days.
 */
export function computeActiveUserMetrics(
  xpEvents: Array<{ user_id: string; created_at: string | Date }>,
  now: Date = new Date()
): { dau: number; wau: number; mau: number } {
  const dauCutoff = now.getTime() - DAY_MS
  const wauCutoff = now.getTime() - 7 * DAY_MS
  const mauCutoff = now.getTime() - 30 * DAY_MS

  const dau = new Set<string>()
  const wau = new Set<string>()
  const mau = new Set<string>()

  for (const event of xpEvents) {
    const t = new Date(event.created_at).getTime()
    if (t >= dauCutoff) dau.add(event.user_id)
    if (t >= wauCutoff) wau.add(event.user_id)
    if (t >= mauCutoff) mau.add(event.user_id)
  }

  return { dau: dau.size, wau: wau.size, mau: mau.size }
}

/**
 * New vs returning learners among the active set.
 *
 * A learner is "returning" when they had XP activity before the selected
 * window; otherwise they are counted as new to the platform in this window.
 */
export function computeNewVsReturning(params: {
  activeUserIds: Set<string>
  usersActiveBeforeWindow: Set<string>
}): { newLearners: number; returningLearners: number } {
  let newLearners = 0
  let returningLearners = 0
  for (const userId of params.activeUserIds) {
    if (params.usersActiveBeforeWindow.has(userId)) returningLearners++
    else newLearners++
  }
  return { newLearners, returningLearners }
}

/** Streak buckets for the engagement histogram (fixed, ordered buckets). */
export const STREAK_BUCKETS: Array<{ bucket: string; min: number; max: number }> = [
  { bucket: '0 days', min: 0, max: 0 },
  { bucket: '1–3 days', min: 1, max: 3 },
  { bucket: '4–7 days', min: 4, max: 7 },
  { bucket: '8–14 days', min: 8, max: 14 },
  { bucket: '15–30 days', min: 15, max: 30 },
  { bucket: '30+ days', min: 31, max: Number.POSITIVE_INFINITY },
]

/**
 * Builds the streak-distribution histogram from user profiles.
 *
 * `current_streak` is read from the `users` table (denormalized by the streak
 * cron). Users with a null/undefined streak are counted in the "0 days" bucket.
 */
export function buildStreakDistribution(
  users: Array<{ current_streak?: number | null }>
): AdminStreakBucket[] {
  const counts = new Map(STREAK_BUCKETS.map((b) => [b.bucket, 0]))
  for (const user of users) {
    const streak = user.current_streak || 0
    const bucket = STREAK_BUCKETS.find((b) => streak >= b.min && streak <= b.max) || STREAK_BUCKETS[STREAK_BUCKETS.length - 1]
    counts.set(bucket.bucket, (counts.get(bucket.bucket) || 0) + 1)
  }
  return STREAK_BUCKETS.map((b) => ({ bucket: b.bucket, count: counts.get(b.bucket) || 0 }))
}

/**
 * Average module completion % across a learner's modules (0–100).
 *
 * `modules` is the output of `buildModuleProgress` (per-user). Returns 0 when
 * the learner has no module progress.
 */
export function computeModuleCompletionPct(modules: Array<{ completedPct: number }>): number {
  if (modules.length === 0) return 0
  const avg = modules.reduce((sum, m) => sum + m.completedPct, 0) / modules.length
  return clampPct(avg)
}