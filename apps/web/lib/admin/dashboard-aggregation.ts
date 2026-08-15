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

/**
 * Timezone used for dashboard date windows and day bucketing.
 *
 * Windows and buckets must agree on the same calendar days — mixing local-time
 * windows with UTC bucketing silently drops/duplicates data around midnight.
 * Defaults to the server's local timezone (overridable via ADMIN_TIMEZONE).
 */
export const DASHBOARD_TIME_ZONE: string =
  process.env.ADMIN_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

interface TzParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Wall-clock fields of a Date instant in `timeZone`. */
function tzPartsOf(date: Date, timeZone: string): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = get('hour')
  if (hour === 24) hour = 0 // some engines emit '24' for midnight with hour12:false
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute'), second: get('second') }
}

/** Builds the Date instant whose wall clock in `timeZone` equals `p` (iterative convergence). */
function instantFromTzParts(p: TzParts, timeZone: string): Date {
  let guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
  for (let i = 0; i < 3; i++) {
    const wall = tzPartsOf(guess, timeZone)
    const deltaMs =
      (p.year - wall.year) * 365 * DAY_MS +
      (p.month - wall.month) * 31 * DAY_MS +
      (p.day - wall.day) * DAY_MS +
      (p.hour - wall.hour) * 3600_000 +
      (p.minute - wall.minute) * 60_000 +
      (p.second - wall.second) * 1000
    if (deltaMs === 0) break
    guess = new Date(guess.getTime() + deltaMs)
  }
  return guess
}

/** Formats a Date as a calendar date key (YYYY-MM-DD) in `timeZone`. */
export function toDateKey(date: Date, timeZone: string = DASHBOARD_TIME_ZONE): string {
  const { year, month, day } = tzPartsOf(date, timeZone)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Local start of the calendar day containing `date`, in `timeZone`. */
export function startOfDay(date: Date, timeZone: string = DASHBOARD_TIME_ZONE): Date {
  const p = tzPartsOf(date, timeZone)
  return instantFromTzParts({ ...p, hour: 0, minute: 0, second: 0 }, timeZone)
}

/** Local end of the calendar day containing `date` (23:59:59.999), in `timeZone`. */
export function endOfDay(date: Date, timeZone: string = DASHBOARD_TIME_ZONE): Date {
  return new Date(startOfDay(addDays(date, 1), timeZone).getTime() - 1)
}

/** Adds whole days to a Date instant (DST-safe for calendar-key purposes). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Parses a YYYY-MM-DD key as local midnight in `timeZone`. */
export function parseLocalDateKey(key: string, timeZone: string = DASHBOARD_TIME_ZONE): Date {
  const [year, month, day] = key.split('-').map(Number)
  return instantFromTzParts({ year, month, day, hour: 0, minute: 0, second: 0 }, timeZone)
}

/**
 * Resolves a range preset (plus optional custom bounds) into an inclusive window.
 *
 * Windows are computed in `timeZone` calendar days and are end-inclusive:
 * `custom` from=2026-08-01 to=2026-08-05 covers the entire local day of Aug 5,
 * and an inverted custom range (from > to) is normalized by swapping bounds.
 */
export function resolveRange(
  key: AdminDateRangeKey,
  from?: string | null,
  to?: string | null,
  timeZone: string = DASHBOARD_TIME_ZONE
): AdminDateRange {
  const now = new Date()

  let start: Date
  let end: Date

  switch (key) {
    case 'today':
      start = startOfDay(now, timeZone)
      end = now
      break
    case '7d':
    case '30d':
    case '90d': {
      const days = key === '7d' ? 7 : key === '30d' ? 30 : 90
      end = now
      start = addDays(startOfDay(now, timeZone), -(days - 1))
      break
    }
    case 'custom':
    default: {
      if (from && to) {
        // Parse both bounds as local midnights, then normalize the order so the
        // window always runs from the earlier day to the later day — an inverted
        // range (from > to) is a user error we silently correct. endOfDay is
        // applied AFTER the swap so the ISO bounds cover both full days.
        const fromDay = parseLocalDateKey(from, timeZone)
        const toDay = parseLocalDateKey(to, timeZone)
        const earlier = fromDay.getTime() <= toDay.getTime() ? fromDay : toDay
        const later = fromDay.getTime() <= toDay.getTime() ? toDay : fromDay
        start = earlier
        end = endOfDay(later, timeZone)
      } else {
        // Missing/invalid custom bounds → fall back to the last 30 calendar days.
        end = now
        start = addDays(startOfDay(now, timeZone), -29)
      }
      break
    }
  }

  return { key, start, end, timeZone }
}

/** Iterates every calendar day in the range (inclusive), oldest first, in the range's timezone. */
export function eachDay(range: AdminDateRange): Date[] {
  const days: Date[] = []
  let cursor = startOfDay(range.start, range.timeZone)
  const endKey = toDateKey(range.end, range.timeZone)
  let guard = 0
  while (toDateKey(cursor, range.timeZone) <= endKey && guard < 1000) {
    days.push(new Date(cursor))
    const next = addDays(cursor, 1)
    // DST guard: advance until the calendar key actually changes.
    cursor = toDateKey(next, range.timeZone) === toDateKey(cursor, range.timeZone) ? addDays(next, 1) : next
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
  for (const day of eachDay(range)) counts.set(toDateKey(day, range.timeZone), 0)
  for (const row of rows) {
    const raw = getDate(row)
    if (!raw) continue
    const key = toDateKey(new Date(raw), range.timeZone)
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
  for (const day of eachDay(range)) sets.set(toDateKey(day, range.timeZone), new Set())
  for (const row of rows) {
    const raw = getDate(row)
    if (!raw) continue
    const key = toDateKey(new Date(raw), range.timeZone)
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
    const key = toDateKey(day, range.timeZone)
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
    const key = toDateKey(day, range.timeZone)
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