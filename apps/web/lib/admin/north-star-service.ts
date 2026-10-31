import { createServiceRoleClient } from '../supabase'
import { ADMIN_CACHE_TAGS } from './cache-tags'
import { cacheWithMaxAge } from './bounded-cache'

/**
 * North-star metric for the admin overview (PROD-15).
 *
 * "Weekly mastering learners": distinct learners who, in an ISO week (Monday start, UTC),
 * completed a lesson with a score of 70 or more or submitted a capstone. The counting lives
 * in the public.weekly_mastering_learners view (20261024000001_product_events.sql), which is
 * fed by lib/events/product-events.ts. This module only reads the current and previous week
 * and derives the trend, so the definition has exactly one home: the view.
 *
 * Same contract as the other overview loaders in dashboard-service.ts: service-role client
 * only, cached for 90s under the dashboard tag, and never throws (a failure returns zeros with
 * `failed: true`, and a failure is not cached).
 */

const NORTH_STAR_CACHE_SECONDS = 90
const DAY_MS = 24 * 60 * 60 * 1000

export interface NorthStarWeekRow {
  week_start: string | null
  mastering_learners: number | string | null
}

export interface NorthStarSummary {
  /** ISO date (YYYY-MM-DD) of the Monday that starts the current UTC week. */
  thisWeekStart: string
  /** ISO date of the Monday that starts the previous UTC week. */
  lastWeekStart: string
  /** Mastering learners so far this week (the week is still running). */
  thisWeek: number
  /** Mastering learners in the whole of last week. */
  lastWeek: number
  /** thisWeek minus lastWeek. */
  delta: number
  /** Percent change against last week, one decimal; null when last week was zero. */
  trendPct: number | null
}

export interface NorthStarSlice extends NorthStarSummary {
  failed: boolean
}

/** The Monday (UTC) that starts the ISO week containing `now`, as YYYY-MM-DD. */
export function isoWeekStartUtc(now: Date): string {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  // getUTCDay: Sunday 0 .. Saturday 6. Days since Monday: Monday 0 .. Sunday 6.
  const daysSinceMonday = (now.getUTCDay() + 6) % 7
  return new Date(midnight - daysSinceMonday * DAY_MS).toISOString().slice(0, 10)
}

function previousWeekStart(weekStart: string): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * DAY_MS).toISOString().slice(0, 10)
}

function toCount(value: number | string | null | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value ?? 0
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0
}

/** Pure: picks this week and last week out of the view rows and derives the trend. */
export function summarizeNorthStar(rows: readonly NorthStarWeekRow[], now: Date): NorthStarSummary {
  const thisWeekStart = isoWeekStartUtc(now)
  const lastWeekStart = previousWeekStart(thisWeekStart)

  let thisWeek = 0
  let lastWeek = 0
  for (const row of rows) {
    const week = row.week_start?.slice(0, 10)
    if (week === thisWeekStart) thisWeek = toCount(row.mastering_learners)
    else if (week === lastWeekStart) lastWeek = toCount(row.mastering_learners)
  }

  const delta = thisWeek - lastWeek
  const trendPct = lastWeek > 0 ? Math.round((delta / lastWeek) * 1000) / 10 : null
  return { thisWeekStart, lastWeekStart, thisWeek, lastWeek, delta, trendPct }
}

/** Reads the current and previous week from the view. Throws on a query error. */
export async function computeNorthStar(now: Date = new Date()): Promise<NorthStarSummary> {
  const thisWeekStart = isoWeekStartUtc(now)
  const lastWeekStart = previousWeekStart(thisWeekStart)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('weekly_mastering_learners')
    .select('week_start, mastering_learners')
    .in('week_start', [lastWeekStart, thisWeekStart])

  if (error) throw new Error(`weekly_mastering_learners: ${error.message}`)
  return summarizeNorthStar(data ?? [], now)
}

/** Cached, never-throwing loader for the overview tile. */
export async function loadNorthStar(now: Date = new Date()): Promise<NorthStarSlice> {
  const thisWeekStart = isoWeekStartUtc(now)
  try {
    const cached = cacheWithMaxAge(() => computeNorthStar(now), ['admin-dashboard', 'north-star', thisWeekStart], {
      revalidate: NORTH_STAR_CACHE_SECONDS,
      tags: [ADMIN_CACHE_TAGS.dashboard],
    })
    return { ...(await cached()), failed: false }
  } catch (err) {
    console.warn('[north-star] loader failed:', err)
    return { ...summarizeNorthStar([], now), failed: true }
  }
}
