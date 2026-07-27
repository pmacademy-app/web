/**
 * Streak Calculation Business Logic (PRD.md §4.7, Architecture.md §6).
 * Timezone-aware day-boundary logic using Intl API.
 */

export interface StreakData {
  currentStreak: number
  longestStreak: number
  streakFreezesAvailable: number
  lastActivityDate: string // 'YYYY-MM-DD' in user's timezone
}

/**
 * Returns current date string formatted as 'YYYY-MM-DD' in given IANA timezone.
 */
export function getLocalDateString(timeZone: string = 'UTC', date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(date) // Returns YYYY-MM-DD
  } catch {
    return date.toISOString().split('T')[0]
  }
}

/**
 * Calculates days difference between two YYYY-MM-DD date strings.
 */
export function getDaysDifference(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1 + 'T00:00:00Z').getTime()
  const d2 = new Date(dateStr2 + 'T00:00:00Z').getTime()
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

/**
 * Updates streak status given new activity event date in user's timezone.
 */
export function recordActivityStreak(
  currentData: StreakData,
  timeZone: string = 'UTC',
  now: Date = new Date()
): StreakData & { streakIncremented: boolean; freezeUsed: boolean } {
  const todayStr = getLocalDateString(timeZone, now)
  const lastStr = currentData.lastActivityDate

  if (!lastStr) {
    // First activity ever
    return {
      currentStreak: 1,
      longestStreak: Math.max(1, currentData.longestStreak),
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: false,
    }
  }

  const diff = getDaysDifference(lastStr, todayStr)

  if (diff === 0) {
    // Already did activity today
    return {
      ...currentData,
      streakIncremented: false,
      freezeUsed: false,
    }
  }

  if (diff === 1) {
    // Consecutive day activity!
    const newStreak = currentData.currentStreak + 1
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, currentData.longestStreak),
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: false,
    }
  }

  if (diff === 2 && currentData.streakFreezesAvailable > 0) {
    // Missed 1 day, but earned freeze is available!
    const newStreak = currentData.currentStreak + 1
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, currentData.longestStreak),
      streakFreezesAvailable: currentData.streakFreezesAvailable - 1,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: true,
    }
  }

  // Missed 2+ days without freeze — streak resets to 1
  return {
    currentStreak: 1,
    longestStreak: currentData.longestStreak,
    streakFreezesAvailable: currentData.streakFreezesAvailable,
    lastActivityDate: todayStr,
    streakIncremented: true,
    freezeUsed: false,
  }
}
