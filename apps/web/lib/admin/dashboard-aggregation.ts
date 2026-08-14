import type {
  AdminDateRange,
  AdminDateRangeKey,
  AdminFunnelStage,
  AdminTimeSeriesPoint,
} from './types'

/**
 * Pure aggregation helpers for the Phase 2 Admin Dashboard.
 *
 * These functions contain NO database access — they transform raw row arrays
 * into dashboard-ready shapes so the math can be unit-tested in isolation.
 * The service layer (`AdminConsoleService`) is responsible for fetching the
 * raw rows; every date bucketing, funnel conversion, and trend delta lives here.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Formats a Date as a UTC calendar date key (YYYY-MM-DD). */
export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Resolves a range preset (plus optional custom bounds) into an inclusive window. */
export function resolveRange(
  key: AdminDateRangeKey,
  from?: string | null,
  to?: string | null
): AdminDateRange {
  const now = new Date()
  const end = to ? new Date(to) : now

  let start: Date
  switch (key) {
    case 'today':
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      break
    case '7d':
      start = new Date(now.getTime() - 6 * DAY_MS)
      break
    case '30d':
      start = new Date(now.getTime() - 29 * DAY_MS)
      break
    case '90d':
      start = new Date(now.getTime() - 89 * DAY_MS)
      break
    case 'custom':
    default:
      start = from ? new Date(from) : new Date(now.getTime() - 29 * DAY_MS)
      break
  }

  return { key, start, end }
}

/** Iterates every calendar day in the range (inclusive), oldest first. */
export function eachDay(range: AdminDateRange): Date[] {
  const days: Date[] = []
  const cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate()))
  const endKey = toDateKey(range.end)
  let guard = 0
  while (toDateKey(cursor) <= endKey && guard < 1000) {
    days.push(new Date(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    guard++
  }
  return days
}

/** Counts rows per day key. `getDate` extracts the timestamp from a row. */
export function countByDay<T>(
  rows: T[],
  getDate: (row: T) => string | Date | null | undefined,
  range: AdminDateRange
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const day of eachDay(range)) counts.set(toDateKey(day), 0)
  for (const row of rows) {
    const raw = getDate(row)
    if (!raw) continue
    const key = toDateKey(new Date(raw))
    if (counts.has(key)) counts.set(key, (counts.get(key) || 0) + 1)
  }
  return counts
}

/** Counts distinct values per day key. `getValue` extracts the grouping value. */
export function countDistinctByDay<T>(
  rows: T[],
  getDate: (row: T) => string | Date | null | undefined,
  getValue: (row: T) => string,
  range: AdminDateRange
): Map<string, Set<string>> {
  const sets = new Map<string, Set<string>>()
  for (const day of eachDay(range)) sets.set(toDateKey(day), new Set())
  for (const row of rows) {
    const raw = getDate(row)
    if (!raw) continue
    const key = toDateKey(new Date(raw))
    const set = sets.get(key)
    if (set) set.add(getValue(row))
  }
  return sets
}

/** Builds the Learner Activity series (new / active / returning per day). */
export function buildLearnerSeries(params: {
  range: AdminDateRange
  newUsers: Array<{ created_at: string | Date }>
  xpEvents: Array<{ user_id: string; created_at: string | Date }>
  /** Set of user ids that had activity before the window (returning definition). */
  usersActiveBeforeWindow: Set<string>
}): AdminTimeSeriesPoint[] {
  const { range } = params
  const newUsersByDay = countByDay(params.newUsers, (r) => r.created_at, range)
  const activeByDay = countDistinctByDay(params.xpEvents, (r) => r.created_at, (r) => r.user_id, range)

  return eachDay(range).map((day) => {
    const key = toDateKey(day)
    const activeSet = activeByDay.get(key) || new Set<string>()
    let returning = 0
    for (const userId of activeSet) {
      if (params.usersActiveBeforeWindow.has(userId)) returning++
    }
    return {
      date: key,
      label: key.slice(5), // MM-DD
      newUsers: newUsersByDay.get(key) || 0,
      activeLearners: activeSet.size,
      returningLearners: returning,
      lessonsCompleted: 0,
      quizAttempts: 0,
      capstonesSubmitted: 0,
    }
  })
}

/** Builds the Learning Activity series (lessons / quizzes / capstones per day). */
export function buildLearningSeries(params: {
  range: AdminDateRange
  lessonsCompleted: Array<{ completed_at: string | Date }>
  quizAttempts: Array<{ attempted_at: string | Date }>
  capstonesSubmitted: Array<{ submitted_at: string | Date }>
}): AdminTimeSeriesPoint[] {
  const { range } = params
  const lessonsByDay = countByDay(params.lessonsCompleted, (r) => r.completed_at, range)
  const quizzesByDay = countByDay(params.quizAttempts, (r) => r.attempted_at, range)
  const capstonesByDay = countByDay(params.capstonesSubmitted, (r) => r.submitted_at, range)

  return eachDay(range).map((day) => {
    const key = toDateKey(day)
    return {
      date: key,
      label: key.slice(5),
      newUsers: 0,
      activeLearners: 0,
      returningLearners: 0,
      lessonsCompleted: lessonsByDay.get(key) || 0,
      quizAttempts: quizzesByDay.get(key) || 0,
      capstonesSubmitted: capstonesByDay.get(key) || 0,
    }
  })
}

/** Merges learner + learning series into a single per-day series. */
export function mergeSeries(
  learner: AdminTimeSeriesPoint[],
  learning: AdminTimeSeriesPoint[]
): AdminTimeSeriesPoint[] {
  const byDate = new Map<string, AdminTimeSeriesPoint>()
  for (const point of learner) byDate.set(point.date, { ...point })
  for (const point of learning) {
    const existing = byDate.get(point.date)
    if (existing) {
      existing.lessonsCompleted = point.lessonsCompleted
      existing.quizAttempts = point.quizAttempts
      existing.capstonesSubmitted = point.capstonesSubmitted
    } else {
      byDate.set(point.date, { ...point })
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Builds the learning funnel with conversion percentages. */
export function buildFunnel(
  stages: Array<{ key: string; label: string; count: number }>
): AdminFunnelStage[] {
  const baseline = stages[0]?.count || 0
  return stages.map((stage, idx) => {
    const previous = idx > 0 ? stages[idx - 1].count : null
    return {
      key: stage.key,
      label: stage.label,
      count: stage.count,
      pctOfPrevious:
        previous === null || previous === 0 ? null : Math.round((stage.count / previous) * 1000) / 10,
      pctOverall: baseline === 0 ? 0 : Math.round((stage.count / baseline) * 1000) / 10,
    }
  })
}

/** Computes a percentage trend between current and previous period (null when not meaningful). */
export function computeTrend(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}