import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import {
  getLocalDateString,
  recordActivityStreak,
  getStreakStatusSummary,
  StreakData,
  StreakStatusSummary,
} from './streaks'
import { XP_VALUES, getRuntimeXpValues } from '../xp'
import { awardXp, hasXpEvent } from '../xp-service'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface WeeklySummaryData {
  daysStudied: number
  currentStreak: number
  longestStreak: number
  streakFreezesAvailable: number
  lessonsCompleted: number
  totalXpEarned: number
  dailyActivityMap: { date: string; studied: boolean; xpEarned: number }[]
}

export async function updateUserStreak(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<void> {
  try {
    const { data: userProfile, error: profileError } = (await (supabase
      .from('users') as unknown as DBChain)
      .select('timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date')
      .eq('id', userId)
      .single()) as unknown as {
      data: {
        timezone: string
        current_streak: number
        longest_streak: number
        streak_freezes_available: number
        last_streak_date?: string | null
      } | null
      error: unknown
    }

    if (profileError || !userProfile) {
      console.error('[streaks-db] Error fetching user profile for streak:', profileError)
      return
    }

    const {
      timezone,
      current_streak,
      longest_streak,
      streak_freezes_available,
      last_streak_date,
    } = userProfile

    let lastActivityDate = last_streak_date || ''
    if (!lastActivityDate) {
      const { data: lastEvent } = (await (supabase
        .from('xp_events') as unknown as DBChain)
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()) as unknown as { data: { created_at: string } | null; error: unknown }

      if (lastEvent?.created_at) {
        lastActivityDate = getLocalDateString(timezone, new Date(lastEvent.created_at))
      }
    }

    const currentStreakData: StreakData = {
      currentStreak: current_streak,
      longestStreak: longest_streak,
      streakFreezesAvailable: streak_freezes_available,
      lastActivityDate,
    }

    const now = new Date()
    const result = recordActivityStreak(currentStreakData, timezone, now)

    if (result.streakIncremented || lastActivityDate !== result.todayStr) {
      const { error: updateError } = await (supabase
        .from('users') as unknown as DBChain)
        .update({
          current_streak: result.currentStreak,
          longest_streak: result.longestStreak,
          streak_freezes_available: result.streakFreezesAvailable,
          last_streak_date: result.todayStr,
        })
        .eq('id', userId)

      if (updateError) {
        console.error('[streaks-db] Error updating user streak fields:', updateError)
      }

      if (result.streakIncremented) {
        const streakSourceId = `streak-${result.todayStr}`
        const alreadyAwardedToday = await hasXpEvent(supabase, userId, 'streak', streakSourceId)

        if (!alreadyAwardedToday) {
          const xpConfig = await getRuntimeXpValues(supabase)
          try {
            await awardXp(
              supabase,
              userId,
              'streak',
              xpConfig.DAILY_STREAK_BASE,
              streakSourceId
            )
          } catch (xpError) {
            console.error('[streaks-db] Error logging streak XP event:', xpError)
          }
        }
      }
    }
  } catch (err) {
    console.error('[streaks-db] Unhandled error in updateUserStreak:', err)
  }
}

export async function getUserStreakStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<StreakStatusSummary> {
  const { data: userProfile, error: profileError } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date')
    .eq('id', userId)
    .single()) as unknown as {
    data: {
      timezone: string
      current_streak: number
      longest_streak: number
      streak_freezes_available: number
      last_streak_date?: string | null
    } | null
    error: unknown
  }

  if (profileError || !userProfile) {
    return {
      status: 'not_started',
      effectiveCurrentStreak: 0,
      longestStreak: 0,
      streakFreezesAvailable: 0,
      isTodayCompleted: false,
      lastActivityDate: '',
      daysSinceLastActivity: 0,
      statusMessage: 'Start your first streak today by completing a lesson!',
    }
  }

  const { timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date } = userProfile

  let lastActivityDate = last_streak_date || ''
  if (!lastActivityDate) {
    const { data: lastEvent } = (await (supabase
      .from('xp_events') as unknown as DBChain)
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as { data: { created_at: string } | null; error: unknown }

    if (lastEvent?.created_at) {
      lastActivityDate = getLocalDateString(timezone, new Date(lastEvent.created_at))
    }
  }

  const streakData: StreakData = {
    currentStreak: current_streak,
    longestStreak: longest_streak,
    streakFreezesAvailable: streak_freezes_available,
    lastActivityDate,
  }

  return getStreakStatusSummary(streakData, timezone, new Date())
}

export async function getWeeklySummary(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<WeeklySummaryData> {
  const statusSummary = await getUserStreakStatus(supabase, userId)
  
  const { data: user } = (await (supabase
    .from('users') as unknown as DBChain)
    .select('timezone')
    .eq('id', userId)
    .single()) as unknown as { data: { timezone: string } | null }

  const timezone = user?.timezone || 'UTC'
  const now = new Date()

  const past7Days: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 84600000)
    past7Days.push(getLocalDateString(timezone, d))
  }

  const sevenDaysAgoIso = new Date(now.getTime() - 8 * 84600000).toISOString()
  const { data: xpEvents } = (await (supabase
    .from('xp_events') as unknown as DBChain)
    .select('source_type, xp_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgoIso)) as unknown as {
    data: { source_type: string; xp_amount: number; created_at: string }[] | null
  }

  const { data: progressRows } = (await (supabase
    .from('user_lesson_progress') as unknown as DBChain)
    .select('lesson_id, status, completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgoIso)) as unknown as {
    data: { lesson_id: string; status: string; completed_at: string }[] | null
  }

  const events = xpEvents || []
  const completedLessons = progressRows || []

  const dailyXpMap = new Map<string, number>()
  let totalXpEarned = 0

  for (const event of events) {
    const eventDate = getLocalDateString(timezone, new Date(event.created_at))
    dailyXpMap.set(eventDate, (dailyXpMap.get(eventDate) || 0) + (event.xp_amount || 0))
    totalXpEarned += event.xp_amount || 0
  }

  const dailyActivityMap = past7Days.map((dateStr) => {
    const xp = dailyXpMap.get(dateStr) || 0
    return {
      date: dateStr,
      studied: xp > 0,
      xpEarned: xp,
    }
  })

  const daysStudied = dailyActivityMap.filter((d) => d.studied).length

  return {
    daysStudied,
    currentStreak: statusSummary.effectiveCurrentStreak,
    longestStreak: statusSummary.longestStreak,
    streakFreezesAvailable: statusSummary.streakFreezesAvailable,
    lessonsCompleted: completedLessons.length,
    totalXpEarned,
    dailyActivityMap,
  }
}
