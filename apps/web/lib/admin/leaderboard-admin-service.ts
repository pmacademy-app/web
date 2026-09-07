import { createServiceRoleClient } from '../supabase'
import { calculateLevel } from '../xp'
import {
  calculateWeekStart,
  calculateRankings,
  getLeaderboardTier,
  type LeaderboardEntry,
  type RawLeaderboardUserMetric,
} from '../leaderboard'

export interface AdminLeaderboardUser extends LeaderboardEntry {
  email?: string | null
  isOptedIn: boolean
  isAnomaly?: boolean
  anomalyReason?: string | null
}

export interface AdminLeaderboardData {
  weekStart: string
  totalLearners: number
  totalWeeklyXp: number
  entries: AdminLeaderboardUser[]
}

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export class LeaderboardAdminService {
  /**
   * Fetches full leaderboard administrative data with privacy flags and anomaly detection.
   */
  public static async getLeaderboardData(
    targetWeekStart?: string,
    search?: string,
    tierFilter?: string
  ): Promise<AdminLeaderboardData> {
    const supabase = createServiceRoleClient()
    const weekStart = targetWeekStart || calculateWeekStart()
    const weekStartDate = new Date(weekStart)

    // 1. Fetch all learners with total_xp > 0
    const { data: usersData } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('id, username, name, email, avatar_url, total_xp, current_streak, level')
      .gt('total_xp', 0)
      .limit(2000)) as unknown as {
      data: Array<{
        id: string
        username: string | null
        name: string | null
        email: string | null
        avatar_url: string | null
        total_xp: number | null
        current_streak: number | null
        level: number | null
      }> | null
    }

    const users = usersData || []
    if (users.length === 0) {
      return {
        weekStart,
        totalLearners: 0,
        totalWeeklyXp: 0,
        entries: [],
      }
    }

    const userIds = users.map((u) => u.id)

    // 2. Fetch opt-out settings
    const { data: optedOutRows } = (await (supabase
      .from('user_leaderboard_settings') as unknown as DBChain)
      .select('user_id')
      .eq('is_opted_in', false)) as unknown as { data: { user_id: string }[] | null }

    const optedOutUserIds = new Set<string>((optedOutRows || []).map((r) => r.user_id))

    // 3. Fetch weekly lesson completions
    const { data: lessonProgress } = (await (supabase
      .from('user_lesson_progress') as unknown as DBChain)
      .select('user_id, status, completed_at')
      .in('user_id', userIds)
      .eq('status', 'completed')
      .gte('completed_at', weekStartDate.toISOString())) as unknown as {
      data: Array<{ user_id: string; status: string; completed_at: string | null }> | null
    }

    // 4. Fetch weekly XP events
    const { data: xpEvents } = (await (supabase
      .from('xp_events') as unknown as DBChain)
      .select('user_id, amount, created_at')
      .in('user_id', userIds)
      .gte('created_at', weekStartDate.toISOString())) as unknown as {
      data: Array<{ user_id: string; amount: number | null; created_at: string }> | null
    }

    // Aggregate user metrics
    const rawMetrics: RawLeaderboardUserMetric[] = users.map((u) => {
      const userLessons = (lessonProgress || []).filter((lp) => lp.user_id === u.id)
      const lessonsCompleted = userLessons.length

      const studyDays = new Set<string>()
      for (const lp of userLessons) {
        if (lp.completed_at) {
          studyDays.add(lp.completed_at.split('T')[0])
        }
      }
      const daysStudied = studyDays.size

      const userXpEvents = (xpEvents || []).filter((xe) => xe.user_id === u.id)
      const xpEarned = userXpEvents.reduce((acc, curr) => acc + (curr.amount || 0), 0)

      const levelInfo = calculateLevel(u.total_xp || 0)

      return {
        userId: u.id,
        username: u.username ?? null,
        name: u.name ?? null,
        avatarUrl: u.avatar_url ?? null,
        levelTitle: levelInfo.title,
        level: levelInfo.level,
        daysStudied,
        lessonsCompleted,
        xpEarned,
        currentStreak: u.current_streak || 0,
        totalXp: u.total_xp || 0,
      }
    })

    const ranked = calculateRankings(rawMetrics)
    const userMap = new Map(users.map((u) => [u.id, u]))

    let totalWeeklyXp = 0
    let enrichedEntries: AdminLeaderboardUser[] = ranked.map((entry) => {
      totalWeeklyXp += entry.xpEarned
      const user = userMap.get(entry.userId)
      const isOptedIn = !optedOutUserIds.has(entry.userId)

      // Anomaly detection: weekly XP > 3000 with 0 study days, or lessons > 40 in a single week
      let isAnomaly = false
      let anomalyReason: string | null = null
      if (entry.xpEarned > 3000 && entry.daysStudied === 0) {
        isAnomaly = true
        anomalyReason = 'High XP without recorded study days'
      } else if (entry.lessonsCompleted > 45) {
        isAnomaly = true
        anomalyReason = 'Abnormal lesson completion speed (>45 in 1 week)'
      }

      return {
        ...entry,
        email: user?.email || null,
        isOptedIn,
        isAnomaly,
        anomalyReason,
      }
    })

    // Search filter
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase()
      enrichedEntries = enrichedEntries.filter(
        (e) =>
          (e.name && e.name.toLowerCase().includes(q)) ||
          (e.username && e.username.toLowerCase().includes(q)) ||
          (e.email && e.email.toLowerCase().includes(q))
      )
    }

    // Tier filter
    if (tierFilter && tierFilter !== 'all') {
      enrichedEntries = enrichedEntries.filter((e) => e.tier?.toLowerCase() === tierFilter.toLowerCase())
    }

    return {
      weekStart,
      totalLearners: ranked.length,
      totalWeeklyXp,
      entries: enrichedEntries,
    }
  }
}
