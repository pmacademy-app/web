import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import {
  getLocalDateString,
  recordActivityStreak,
  getStreakStatusSummary,
  StreakData,
  StreakStatusSummary,
} from './streaks'
import { getRuntimeXpValues } from '../xp'
import { awardXp, hasXpEvent } from '../xp-service'
import { MS_PER_DAY } from '../time'

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
    const { data: userProfile, error: profileError } = await supabase
      .from('users')
      .select('timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date')
      .eq('id', userId)
      .single()

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
      const { data: lastEvent } = await supabase
        .from('xp_events')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

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
      const { error: updateError } = await supabase
        .from('users')
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

        const milestoneDays = [3, 7, 14, 30, 60, 90, 100, 365]
        if (milestoneDays.includes(result.currentStreak)) {
          try {
            const { data: userRec } = await supabase
              .from('users')
              .select('email, name')
              .eq('id', userId)
              .maybeSingle()

            const { globalNotificationDispatcher } = await import('../notifications/dispatcher')
            const { initializeNotificationConnectors } = await import('../notifications/events/connectors')
            initializeNotificationConnectors()

            await globalNotificationDispatcher.dispatch({
              id: `streak-${userId}-${result.currentStreak}-${result.todayStr}`,
              event: 'streak.updated',
              userId,
              userEmail: userRec?.email || '',
              userName: userRec?.name || 'Learner',
              userTimezone: timezone || 'UTC',
              priority: 'low',
              category: 'learning',
              occurredAt: new Date().toISOString(),
              payload: {
                userId,
                currentStreak: result.currentStreak,
              },
            })
          } catch (notifErr) {
            console.warn('[streaks-db] Streak updated notification dispatch warning:', notifErr)
          }
        }
      }
    }
  } catch (err) {
    console.error('[streaks-db] Unhandled error in updateUserStreak:', err)
  }
}

/** Summary shown for a learner who has no streak profile yet. */
export function notStartedStreakStatus(): StreakStatusSummary {
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

export async function getUserStreakStatus(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<StreakStatusSummary> {
  const { data: userProfile, error: profileError } = await supabase
    .from('users')
    .select('timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date')
    .eq('id', userId)
    .maybeSingle()

  // CQ-01: a failed read must not look like a learner with no streak. Callers
  // decide how to degrade; a genuinely missing row is still "not started".
  if (profileError) {
    throw new Error('Streak profile read failed: ' + profileError.message)
  }
  if (!userProfile) {
    return notStartedStreakStatus()
  }

  const { timezone, current_streak, longest_streak, streak_freezes_available, last_streak_date } = userProfile

  let lastActivityDate = last_streak_date || ''
  if (!lastActivityDate) {
    const { data: lastEvent } = await supabase
      .from('xp_events')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

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
  
  const { data: user } = await supabase
    .from('users')
    .select('timezone')
    .eq('id', userId)
    .single()

  const timezone = user?.timezone || 'UTC'
  const now = new Date()

  // Step back by calendar day from the learner's local "today" so the window is
  // always 7 distinct consecutive dates, whatever the time of day or UTC offset.
  const todayLocal = getLocalDateString(timezone, now)
  const [year, month, day] = todayLocal.split('-').map(Number)
  const past7Days: string[] = []
  for (let i = 6; i >= 0; i--) {
    past7Days.push(new Date(Date.UTC(year, month - 1, day - i)).toISOString().slice(0, 10))
  }

  // One extra day of slack covers any UTC offset; rows are bucketed by local date below.
  const sevenDaysAgoIso = new Date(now.getTime() - 8 * MS_PER_DAY).toISOString()
  const { data: xpEvents } = await supabase
    .from('xp_events')
    .select('source_type, xp_amount, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgoIso)

  const { data: progressRows } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id, status, completed_at')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', sevenDaysAgoIso)

  // The query bound is 8 days wide, so totals count only rows whose local date
  // falls inside the 7 day window shown to the learner.
  const windowDays = new Set(past7Days)
  const inWindow = (iso: string | null | undefined): boolean =>
    !!iso && windowDays.has(getLocalDateString(timezone, new Date(iso)))

  const events = (xpEvents || []).filter((event) => inWindow(event.created_at))
  const completedLessons = (progressRows || []).filter((row) => inWindow(row.completed_at))

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
