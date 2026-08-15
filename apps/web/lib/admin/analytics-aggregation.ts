import { clampPct } from './users-aggregation'
import { eachDay, toDateKey } from './dashboard-aggregation'
import type {
  AdminStreakBucket,
  AdminLevelDistribution,
  AdminXpSourceDistribution,
  AdminQuizPerformanceStats,
  AdminModuleDropOff,
  AdminDailyXpPoint,
  AdminDailyCertificatePoint,
  AdminDateRange,
} from './types'


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

/** Level display labels for Level Distribution breakdown. */
export const LEVEL_TIERS: Array<{ level: number; label: string }> = [
  { level: 1, label: 'Level 1 (Initiate)' },
  { level: 2, label: 'Level 2 (Explorer)' },
  { level: 3, label: 'Level 3 (Practitioner)' },
  { level: 4, label: 'Level 4 (Strategist)' },
  { level: 5, label: 'Level 5 (Leader)' },
]

/**
 * Builds user distribution by level.
 */
export function computeLevelDistribution(
  users: Array<{ level?: number | null }>
): AdminLevelDistribution[] {
  const total = users.length
  const counts = new Map<number, number>()
  for (let i = 1; i <= 5; i++) counts.set(i, 0)

  for (const user of users) {
    const lvl = Math.min(5, Math.max(1, user.level || 1))
    counts.set(lvl, (counts.get(lvl) || 0) + 1)
  }

  return LEVEL_TIERS.map((tier) => {
    const count = counts.get(tier.level) || 0
    const percentage = total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    return {
      level: tier.level,
      label: tier.label,
      count,
      percentage,
    }
  })
}

/** Known human-readable labels for XP sources. */
const XP_SOURCE_LABELS: Record<string, string> = {
  lesson: 'Lesson Completions',
  quiz: 'Quizzes Passed',
  streak: 'Streak Bonuses',
  flashcard: 'Flashcard Reviews',
  reflection: 'Reflections',
  capstone: 'Capstone Submissions',
  bonus: 'Bonus XP',
  other: 'Other Activities',
}

/**
 * Aggregates XP earned by source activity tag.
 */
export function computeXpBySource(
  events: Array<{ xp_amount?: number | null; source?: string | null }>
): AdminXpSourceDistribution[] {
  const totals = new Map<string, number>()
  let overallXp = 0

  for (const event of events) {
    const amt = Math.max(0, event.xp_amount || 0)
    if (amt === 0) continue
    overallXp += amt
    const rawSource = (event.source || 'other').toLowerCase()
    const sourceKey = XP_SOURCE_LABELS[rawSource] ? rawSource : 'other'
    totals.set(sourceKey, (totals.get(sourceKey) || 0) + amt)
  }

  const result: AdminXpSourceDistribution[] = []
  for (const [source, xp] of totals.entries()) {
    const percentage = overallXp > 0 ? Math.round((xp / overallXp) * 1000) / 10 : 0
    result.push({
      source,
      label: XP_SOURCE_LABELS[source] || source,
      xp,
      percentage,
    })
  }

  // Sort descending by XP amount
  return result.sort((a, b) => b.xp - a.xp)
}

/** Score range buckets for quiz performance. */
const QUIZ_SCORE_BUCKETS = [
  { range: '90–100%', min: 90, max: 100 },
  { range: '70–89%', min: 70, max: 89 },
  { range: '50–69%', min: 50, max: 69 },
  { range: '0–49%', min: 0, max: 49 },
]

/**
 * Computes aggregate quiz performance stats and score distribution.
 */
export function computeQuizPerformanceStats(
  attempts: Array<{ is_correct?: boolean | null; score?: number | null }>
): AdminQuizPerformanceStats {
  const totalAttempts = attempts.length
  if (totalAttempts === 0) {
    return {
      totalAttempts: 0,
      passedAttempts: 0,
      passRatePct: 0,
      avgScorePct: null,
      scoreDistribution: QUIZ_SCORE_BUCKETS.map((b) => ({ range: b.range, count: 0 })),
    }
  }

  let passed = 0
  let scoreSum = 0
  let scoredCount = 0
  const bucketCounts = new Map(QUIZ_SCORE_BUCKETS.map((b) => [b.range, 0]))

  for (const attempt of attempts) {
    if (attempt.is_correct) passed++

    // If explicit numeric score (0-100) is present, use it; otherwise binary 100 or 0
    const scoreVal =
      typeof attempt.score === 'number' && !Number.isNaN(attempt.score)
        ? Math.min(100, Math.max(0, attempt.score))
        : attempt.is_correct
        ? 100
        : 0

    scoreSum += scoreVal
    scoredCount++

    const matchedBucket =
      QUIZ_SCORE_BUCKETS.find((b) => scoreVal >= b.min && scoreVal <= b.max) ||
      QUIZ_SCORE_BUCKETS[QUIZ_SCORE_BUCKETS.length - 1]
    bucketCounts.set(matchedBucket.range, (bucketCounts.get(matchedBucket.range) || 0) + 1)
  }

  const passRatePct = Math.round((passed / totalAttempts) * 1000) / 10
  const avgScorePct = scoredCount > 0 ? Math.round((scoreSum / scoredCount) * 10) / 10 : null

  return {
    totalAttempts,
    passedAttempts: passed,
    passRatePct,
    avgScorePct,
    scoreDistribution: QUIZ_SCORE_BUCKETS.map((b) => ({
      range: b.range,
      count: bucketCounts.get(b.range) || 0,
    })),
  }
}

/**
 * Computes sequential module drop-offs and completion rates across the curriculum.
 */
export function computeModuleDropOffs(
  modules: Array<{ slug: string; title: string; order: number; lessonIds: string[] }>,
  completedLessons: Array<{ lesson_id: string; user_id: string }>,
  totalPlatformLearners: number
): AdminModuleDropOff[] {

  if (modules.length === 0) return []

  // Build per-user completed lesson set
  const userCompletions = new Map<string, Set<string>>()
  for (const row of completedLessons) {
    if (!userCompletions.has(row.user_id)) userCompletions.set(row.user_id, new Set())
    userCompletions.get(row.user_id)!.add(row.lesson_id)
  }

  const sortedModules = [...modules].sort((a, b) => a.order - b.order)
  let prevCompleted = totalPlatformLearners

  return sortedModules.map((mod, idx) => {
    const lessonSet = new Set(mod.lessonIds)
    const lessonCount = lessonSet.size

    let startedCount = 0
    let completedCount = 0

    for (const [, userLessonSet] of userCompletions.entries()) {
      let completedInModule = 0
      for (const lid of lessonSet) {
        if (userLessonSet.has(lid)) completedInModule++
      }
      if (completedInModule > 0) startedCount++
      if (lessonCount > 0 && completedInModule >= lessonCount) completedCount++
    }

    const completionPct = startedCount > 0 ? Math.round((completedCount / startedCount) * 1000) / 10 : 0
    // Drop-off percentage from previous stage or started
    const dropOffBaseline = idx === 0 ? Math.max(startedCount, 1) : Math.max(prevCompleted, 1)
    const dropOffPct = Math.max(0, Math.round(((dropOffBaseline - startedCount) / dropOffBaseline) * 1000) / 10)
    prevCompleted = completedCount

    return {
      slug: mod.slug,
      title: mod.title,
      order: mod.order,
      lessonCount,
      learnersStarted: startedCount,
      learnersCompleted: completedCount,
      completionPct,
      dropOffPct,
    }
  })
}

/**
 * Builds daily XP velocity time-series.
 */
export function buildDailyXpSeries(
  events: Array<{ xp_amount?: number | null; created_at: string | Date }>,
  range: AdminDateRange
): AdminDailyXpPoint[] {
  const days: Date[] = eachDay(range)
  const totals = new Map<string, number>()
  for (const day of days) totals.set(toDateKey(day, range.timeZone), 0)

  for (const event of events) {
    if (!event.created_at) continue
    const amt = Math.max(0, event.xp_amount || 0)
    const key = toDateKey(new Date(event.created_at), range.timeZone)
    if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + amt)
  }

  return days.map((day) => {
    const key = toDateKey(day, range.timeZone)
    return {
      date: key,
      label: key.slice(5),
      xp: totals.get(key) || 0,
    }
  })
}

/**
 * Builds daily certificate issuance time-series.
 */
export function buildCertificateSeries(
  certificates: Array<{ issued_at: string | Date }>,
  range: AdminDateRange
): AdminDailyCertificatePoint[] {
  const days: Date[] = eachDay(range)
  const totals = new Map<string, number>()
  for (const day of days) totals.set(toDateKey(day, range.timeZone), 0)

  for (const cert of certificates) {
    if (!cert.issued_at) continue
    const key = toDateKey(new Date(cert.issued_at), range.timeZone)
    if (totals.has(key)) totals.set(key, (totals.get(key) || 0) + 1)
  }

  return days.map((day) => {
    const key = toDateKey(day, range.timeZone)
    return {
      date: key,
      label: key.slice(5),
      count: totals.get(key) || 0,
    }
  })
}