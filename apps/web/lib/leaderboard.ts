/**
 * Pure Leaderboard & Consistency Ranking Utilities (Phase 3 Sprint 5)
 *
 * Implements consistency-first ranking logic:
 * Primary sort: Days studied in week DESC
 * Secondary sort: Lessons completed in week DESC
 * Tertiary tie-breaker: Weekly XP earned DESC
 *
 * Pure stateless functions with zero UI coupling.
 */

export interface RawLeaderboardUserMetric {
  userId: string
  username: string | null
  name: string | null
  avatarUrl: string | null
  levelTitle: string
  level: number
  daysStudied: number
  lessonsCompleted: number
  xpEarned: number
  currentStreak: number
  previousRank?: number | null
}

export interface LeaderboardEntry extends RawLeaderboardUserMetric {
  rank: number
  positionChange: number // positive = gained ranks, negative = lost ranks, 0 = unchanged
  isCurrentUser: boolean
}

/**
 * Returns the ISO YYYY-MM-DD date string for Monday of the given date (UTC deterministic).
 */
export function calculateWeekStart(d: Date = new Date()): string {
  const date = new Date(d)
  const day = date.getUTCDay()
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff))
  return monday.toISOString().split('T')[0]
}

/**
 * Calculates consistency-first rankings for a set of user metrics.
 */
export function calculateRankings(
  entries: RawLeaderboardUserMetric[],
  currentUserId?: string
): LeaderboardEntry[] {
  const sorted = [...entries].sort((a, b) => {
    // 1. Days studied in week (Consistency primary)
    if (b.daysStudied !== a.daysStudied) {
      return b.daysStudied - a.daysStudied
    }
    // 2. Lessons completed in week
    if (b.lessonsCompleted !== a.lessonsCompleted) {
      return b.lessonsCompleted - a.lessonsCompleted
    }
    // 3. Weekly XP earned (Tie-breaker)
    if (b.xpEarned !== a.xpEarned) {
      return b.xpEarned - a.xpEarned
    }
    // 4. Current streak
    return b.currentStreak - a.currentStreak
  })

  return sorted.map((item, index) => {
    const rank = index + 1
    const previousRank = item.previousRank ?? rank
    const positionChange = previousRank - rank

    return {
      ...item,
      rank,
      positionChange,
      isCurrentUser: Boolean(currentUserId && item.userId === currentUserId),
    }
  })
}
