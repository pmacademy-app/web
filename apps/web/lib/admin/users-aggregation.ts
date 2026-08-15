import type {
  AdminUserActivityItem,
  AdminUserActivityType,
  AdminUserFilters,
  AdminUserModuleProgress,
} from './types'
import type { CurriculumEntry } from '@/types'

/**
 * Pure aggregation helpers for the Phase 3 Users Workspace.
 *
 * These functions contain NO database access — they transform raw row arrays
 * into user-workspace-ready shapes so the math can be unit-tested in isolation.
 * The service layer (`AdminConsoleService`) is responsible for fetching the raw
 * rows; progress math, module bucketing, timeline building, and filter parsing
 * live here.
 */

/** Total lessons in the curriculum (used as the course-progress denominator). */
export const TOTAL_LESSONS = 90

/** Clamps a value to [0, 100] and rounds to one decimal place. */
export function clampPct(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10
}

/**
 * Curriculum completion percentage.
 *
 * `completedLessons` is the count of completed lessons; `hasCompletionBadge`
 * short-circuits to 100% (the `cpo_completion` badge marks full-curriculum
 * completion, matching the dashboard funnel definition).
 */
export function computeProgressPct(completedLessons: number, hasCompletionBadge = false): number {
  if (hasCompletionBadge) return 100
  return clampPct((completedLessons / TOTAL_LESSONS) * 100)
}

/**
 * Groups curriculum lessons by module and counts how many the user completed.
 *
 * `completedLessonIds` is the set of lesson ids with `status = 'completed'`.
 * Modules with no lessons in the curriculum are omitted.
 */
export function buildModuleProgress(
  completedLessonIds: Set<string>,
  curriculum: CurriculumEntry[]
): AdminUserModuleProgress[] {
  const byModule = new Map<string, { title: string; total: number; done: number }>()

  for (const lesson of curriculum) {
    const entry = byModule.get(lesson.module)
    if (entry) {
      entry.total += 1
      if (completedLessonIds.has(lesson.id)) entry.done += 1
    } else {
      byModule.set(lesson.module, {
        title: lesson.module,
        total: 1,
        done: completedLessonIds.has(lesson.id) ? 1 : 0,
      })
    }
  }

  return [...byModule.entries()]
    .map(([slug, { title, total, done }]) => ({
      slug,
      title,
      lessonsCompleted: done,
      lessonsTotal: total,
      completedPct: clampPct((done / total) * 100),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Average quiz score as a percentage (null when there are no attempts). */
export function computeQuizAvgScore(attempts: Array<{ is_correct: boolean }>): number | null {
  if (attempts.length === 0) return null
  const correct = attempts.filter((a) => a.is_correct).length
  return Math.round((correct / attempts.length) * 1000) / 10
}

/**
 * Builds a chronological activity timeline from raw event rows.
 *
 * Each source contributes typed rows; the union is sorted newest-first and
 * capped at `limit`. `resolveDetail` maps a lesson id to a human-readable
 * lesson title when available.
 */
export function buildUserActivityTimeline(
  sources: Array<{
    type: AdminUserActivityType
    label: string
    detail: string
    timestamp: string | null | undefined
  }>,
  limit = 25
): AdminUserActivityItem[] {
  const items: AdminUserActivityItem[] = []

  for (const [idx, source] of sources.entries()) {
    if (!source.timestamp) continue
    items.push({
      // Index keeps ids unique when a source produces identical type/detail
      // timestamps (e.g. two quiz attempts on the same lesson within the same
      // millisecond), avoiding duplicate React keys in the timeline.
      id: `${source.type}-${idx}-${source.timestamp}`,
      type: source.type,
      label: source.label,
      detail: source.detail,
      timestamp: source.timestamp,
    })
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit)
}

/** Matches a strict `YYYY-MM-DD` calendar date (used by the date filters). */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Returns the value only when it is a well-formed, real `YYYY-MM-DD` date. */
function validIsoDate(value: string | undefined): string | undefined {
  if (!value || !ISO_DATE_RE.test(value)) return undefined
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Reject rollovers such as 2026-13-99 (which Date would normalize).
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }
  return value
}

/** Parses raw search params into a typed `AdminUserFilters` object. */
export function parseUserFilters(
  params: Record<string, string | string[] | undefined>
): AdminUserFilters {
  const get = (key: string): string | undefined => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const verification = get('verification')
  const role = get('role')
  const activity = get('activity')
  const progress = get('progress')
  const minLevelRaw = get('minLevel')
  const minLevel = minLevelRaw ? Number.parseInt(minLevelRaw, 10) : undefined
  const sort = get('sort')
  const sortDir = get('sortDir')

  return {
    verification: verification === 'verified' || verification === 'unverified' ? verification : undefined,
    role: role === 'admin' || role === 'learner' ? role : undefined,
    activity: activity === 'active' || activity === 'inactive' ? activity : undefined,
    progress: progress === 'none' || progress === 'started' || progress === 'completed' ? progress : undefined,
    minLevel: minLevel && Number.isFinite(minLevel) ? minLevel : undefined,
    joinedFrom: validIsoDate(get('joinedFrom')),
    joinedTo: validIsoDate(get('joinedTo')),
    activeFrom: validIsoDate(get('activeFrom')),
    activeTo: validIsoDate(get('activeTo')),
    sort:
      sort === 'createdAt' || sort === 'lastActiveAt' || sort === 'totalXp' || sort === 'level' || sort === 'streakDays' || sort === 'progressPct'
        ? sort
        : undefined,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : undefined,
  }
}

/** Serializes active filters into URL search params (for deep links + chips). */
export function serializeUserFilters(filters: AdminUserFilters): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.verification) params.verification = filters.verification
  if (filters.role) params.role = filters.role
  if (filters.activity) params.activity = filters.activity
  if (filters.progress) params.progress = filters.progress
  if (filters.minLevel !== undefined) params.minLevel = String(filters.minLevel)
  if (filters.joinedFrom) params.joinedFrom = filters.joinedFrom
  if (filters.joinedTo) params.joinedTo = filters.joinedTo
  if (filters.activeFrom) params.activeFrom = filters.activeFrom
  if (filters.activeTo) params.activeTo = filters.activeTo
  if (filters.sort) params.sort = filters.sort
  if (filters.sortDir) params.sortDir = filters.sortDir
  return params
}

/** Human-readable label for an active filter (used in the chips row). */
export function describeUserFilter(filters: AdminUserFilters): string[] {
  const chips: string[] = []
  if (filters.verification) chips.push(filters.verification === 'verified' ? 'Verified' : 'Unverified')
  if (filters.role) chips.push(filters.role === 'admin' ? 'Admins' : 'Learners')
  if (filters.activity) chips.push(filters.activity === 'active' ? 'Active (30d)' : 'Inactive (30d)')
  if (filters.progress) {
    chips.push(
      filters.progress === 'none' ? 'No progress' : filters.progress === 'started' ? 'In progress' : 'Completed'
    )
  }
  if (filters.minLevel !== undefined) chips.push(`Level ${filters.minLevel}+`)
  if (filters.joinedFrom || filters.joinedTo) {
    chips.push(`Joined ${filters.joinedFrom || '…'} → ${filters.joinedTo || '…'}`)
  }
  if (filters.activeFrom || filters.activeTo) {
    chips.push(`Active ${filters.activeFrom || '…'} → ${filters.activeTo || '…'}`)
  }
  return chips
}