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

export type LeaderboardTier = 'Bronze' | 'Silver' | 'Gold' | 'Diamond' | 'Fellow'

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
  totalXp?: number
  previousRank?: number | null
}

export interface LeaderboardEntry extends RawLeaderboardUserMetric {
  rank: number
  positionChange: number // positive = gained ranks, negative = lost ranks, 0 = unchanged
  isCurrentUser: boolean
  tier?: LeaderboardTier
  pointsToNextRank?: number | null
}

/**
 * Resolves learning tier and design token colors based on level and experience.
 */
export function getLeaderboardTier(level: number, totalXp: number = 0): {
  tier: LeaderboardTier
  badgeColor: string
} {
  if (level >= 9 || totalXp >= 10000) {
    return { tier: 'Fellow', badgeColor: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' }
  }
  if (level >= 7 || totalXp >= 5000) {
    return { tier: 'Diamond', badgeColor: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30' }
  }
  if (level >= 5 || totalXp >= 2500) {
    return { tier: 'Gold', badgeColor: 'text-amber-500 bg-amber-500/10 border-amber-500/30' }
  }
  if (level >= 3 || totalXp >= 1000) {
    return { tier: 'Silver', badgeColor: 'text-slate-400 bg-slate-400/10 border-slate-400/30' }
  }
  return { tier: 'Bronze', badgeColor: 'text-amber-700 bg-amber-700/10 border-amber-700/30' }
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
    const tierInfo = getLeaderboardTier(item.level, item.totalXp ?? item.xpEarned)

    // Calculate gap to next rank
    let pointsToNextRank: number | null = null
    if (index > 0) {
      const aheadUser = sorted[index - 1]
      // Calculate XP gap if days and lessons are equal, or estimate XP needed
      const xpGap = (aheadUser.xpEarned || 0) - (item.xpEarned || 0) + 1
      pointsToNextRank = xpGap > 0 ? xpGap : 10
    }

    return {
      ...item,
      rank,
      positionChange,
      isCurrentUser: Boolean(currentUserId && item.userId === currentUserId),
      tier: tierInfo.tier,
      pointsToNextRank,
    }
  })
}
