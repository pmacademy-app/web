import { createServerSupabaseClient } from '@/lib/supabase'
import { getLocalDateString, recordActivityStreak, StreakData } from '@/lib/streaks'
import { XP_VALUES } from '@/lib/xp'
import { awardXp } from '@/lib/xp-service'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

/**
 * Updates a user's streak in the database and logs a streak maintenance XP event if applicable.
 */
export async function updateUserStreak(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string
): Promise<void> {
  try {
    // 1. Fetch user profile
    const { data: userProfile, error: profileError } = (await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()) as unknown as { data: { timezone: string; current_streak: number; longest_streak: number; streak_freezes_available: number } | null; error: unknown }

    if (profileError || !userProfile) {
      console.error('[streaks-db] Error fetching user profile for streak:', profileError)
      return
    }

    const { timezone, current_streak, longest_streak, streak_freezes_available } = userProfile

    // 2. Fetch the most recent xp_event to find the last activity date
    const { data: lastEvent, error: eventError } = (await supabase
      .from('xp_events')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as { data: { created_at: string } | null; error: unknown }

    if (eventError) {
      console.error('[streaks-db] Error fetching last xp event for streak:', eventError)
    }

    let lastActivityDate = ''
    if (lastEvent?.created_at) {
      lastActivityDate = getLocalDateString(timezone, new Date(lastEvent.created_at))
    }

    const currentStreakData: StreakData = {
      currentStreak: current_streak,
      longestStreak: longest_streak,
      streakFreezesAvailable: streak_freezes_available,
      lastActivityDate,
    }

    const now = new Date()
    const result = recordActivityStreak(currentStreakData, timezone, now)
    const todayStr = getLocalDateString(timezone, now)

    // 3. Update DB if the activity date changed
    if (lastActivityDate !== todayStr) {
      const { error: updateError } = await (supabase
        .from('users') as unknown as DBChain)
        .update({
          current_streak: result.currentStreak,
          longest_streak: result.longestStreak,
          streak_freezes_available: result.streakFreezesAvailable,
        })
        .eq('id', userId)

      if (updateError) {
        console.error('[streaks-db] Error updating user streak fields:', updateError)
      }

      // 4. Award XP for maintaining streak
      if (result.streakIncremented) {
        try {
          await awardXp(
            supabase,
            userId,
            'streak',
            XP_VALUES.DAILY_STREAK_BASE,
            `streak-${result.currentStreak}`
          )
        } catch (xpError) {
          console.error('[streaks-db] Error logging streak XP event:', xpError)
        }
      }
    }
  } catch (err) {
    console.error('[streaks-db] Unhandled error in updateUserStreak:', err)
  }
}
