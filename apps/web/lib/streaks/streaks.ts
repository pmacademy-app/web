export const STREAK_RULES = {
  FREEZE_EARN_INTERVAL_DAYS: 7,
  MAX_FREEZES: 2,
  DAILY_STREAK_XP: 5,
} as const

export interface StreakData {
  currentStreak: number
  longestStreak: number
  streakFreezesAvailable: number
  lastActivityDate: string
}

export interface StreakCalculationResult extends StreakData {
  streakIncremented: boolean
  freezeUsed: boolean
  freezeEarned: boolean
  streakBroken: boolean
  todayStr: string
}

export type StreakStatus = 'not_started' | 'active' | 'at_risk' | 'broken'

export interface StreakStatusSummary {
  status: StreakStatus
  effectiveCurrentStreak: number
  longestStreak: number
  streakFreezesAvailable: number
  isTodayCompleted: boolean
  lastActivityDate: string
  daysSinceLastActivity: number
  statusMessage: string
}

export function getLocalDateString(timeZone: string = 'UTC', date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(date)
  } catch {
    return date.toISOString().split('T')[0]
  }
}

export function getDaysDifference(dateStr1: string, dateStr2: string): number {
  if (!dateStr1 || !dateStr2) return 0
  const d1 = new Date(dateStr1 + 'T00:00:00Z').getTime()
  const d2 = new Date(dateStr2 + 'T00:00:00Z').getTime()
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24))
}

export function isSameDay(dateStr1: string, dateStr2: string): boolean {
  return !!dateStr1 && !!dateStr2 && dateStr1 === dateStr2
}

export function isConsecutiveDay(lastDateStr: string, currentDateStr: string): boolean {
  return getDaysDifference(lastDateStr, currentDateStr) === 1
}

export function checkEarnedFreezeEligibility(
  newStreakCount: number,
  currentFreezes: number,
  maxFreezes: number = STREAK_RULES.MAX_FREEZES
): boolean {
  if (newStreakCount <= 0) return false
  if (currentFreezes >= maxFreezes) return false
  return newStreakCount % STREAK_RULES.FREEZE_EARN_INTERVAL_DAYS === 0
}

export function recordActivityStreak(
  currentData: StreakData,
  timeZone: string = 'UTC',
  now: Date = new Date()
): StreakCalculationResult {
  const todayStr = getLocalDateString(timeZone, now)
  const lastStr = currentData.lastActivityDate

  if (!lastStr) {
    const newStreak = 1
    const freezeEarned = checkEarnedFreezeEligibility(
      newStreak,
      currentData.streakFreezesAvailable
    )
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(1, currentData.longestStreak),
      streakFreezesAvailable: freezeEarned
        ? currentData.streakFreezesAvailable + 1
        : currentData.streakFreezesAvailable,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: false,
      freezeEarned,
      streakBroken: false,
      todayStr,
    }
  }

  const diff = getDaysDifference(lastStr, todayStr)

  if (diff <= 0) {
    return {
      ...currentData,
      streakIncremented: false,
      freezeUsed: false,
      freezeEarned: false,
      streakBroken: false,
      todayStr,
    }
  }

  if (diff === 1) {
    const newStreak = currentData.currentStreak + 1
    const freezeEarned = checkEarnedFreezeEligibility(
      newStreak,
      currentData.streakFreezesAvailable
    )
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, currentData.longestStreak),
      streakFreezesAvailable: freezeEarned
        ? currentData.streakFreezesAvailable + 1
        : currentData.streakFreezesAvailable,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: false,
      freezeEarned,
      streakBroken: false,
      todayStr,
    }
  }

  if (diff === 2 && currentData.streakFreezesAvailable > 0) {
    const remainingFreezes = currentData.streakFreezesAvailable - 1
    const newStreak = currentData.currentStreak + 1
    const freezeEarned = checkEarnedFreezeEligibility(newStreak, remainingFreezes)

    return {
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, currentData.longestStreak),
      streakFreezesAvailable: freezeEarned ? remainingFreezes + 1 : remainingFreezes,
      lastActivityDate: todayStr,
      streakIncremented: true,
      freezeUsed: true,
      freezeEarned,
      streakBroken: false,
      todayStr,
    }
  }

  const newStreak = 1
  const freezeEarned = checkEarnedFreezeEligibility(
    newStreak,
    currentData.streakFreezesAvailable
  )

  return {
    currentStreak: newStreak,
    longestStreak: Math.max(currentData.longestStreak, 1),
    streakFreezesAvailable: freezeEarned
      ? currentData.streakFreezesAvailable + 1
      : currentData.streakFreezesAvailable,
    lastActivityDate: todayStr,
    streakIncremented: true,
    freezeUsed: false,
    freezeEarned,
    streakBroken: currentData.currentStreak > 0,
    todayStr,
  }
}

export function getStreakStatusSummary(
  currentData: StreakData,
  timeZone: string = 'UTC',
  now: Date = new Date()
): StreakStatusSummary {
  const todayStr = getLocalDateString(timeZone, now)
  const lastStr = currentData.lastActivityDate

  if (!lastStr) {
    return {
      status: 'not_started',
      effectiveCurrentStreak: 0,
      longestStreak: currentData.longestStreak,
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      isTodayCompleted: false,
      lastActivityDate: '',
      daysSinceLastActivity: 0,
      statusMessage: 'Start your first streak today by completing a lesson!',
    }
  }

  const diff = getDaysDifference(lastStr, todayStr)

  if (diff <= 0) {
    return {
      status: 'active',
      effectiveCurrentStreak: currentData.currentStreak,
      longestStreak: currentData.longestStreak,
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      isTodayCompleted: true,
      lastActivityDate: lastStr,
      daysSinceLastActivity: 0,
      statusMessage: `Great job! You maintained your ${currentData.currentStreak}-day streak today.`,
    }
  }

  if (diff === 1) {
    return {
      status: 'at_risk',
      effectiveCurrentStreak: currentData.currentStreak,
      longestStreak: currentData.longestStreak,
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      isTodayCompleted: false,
      lastActivityDate: lastStr,
      daysSinceLastActivity: 1,
      statusMessage: `Complete a lesson today to reach a ${currentData.currentStreak + 1}-day streak!`,
    }
  }

  if (diff === 2 && currentData.streakFreezesAvailable > 0) {
    return {
      status: 'at_risk',
      effectiveCurrentStreak: currentData.currentStreak,
      longestStreak: currentData.longestStreak,
      streakFreezesAvailable: currentData.streakFreezesAvailable,
      isTodayCompleted: false,
      lastActivityDate: lastStr,
      daysSinceLastActivity: 2,
      statusMessage: `Streak protected by freeze! Study today to continue your ${currentData.currentStreak + 1}-day streak.`,
    }
  }

  return {
    status: 'broken',
    effectiveCurrentStreak: 0,
    longestStreak: currentData.longestStreak,
    streakFreezesAvailable: currentData.streakFreezesAvailable,
    isTodayCompleted: false,
    lastActivityDate: lastStr,
    daysSinceLastActivity: diff,
    statusMessage: 'Your streak was reset. Complete a lesson today to start a new streak!',
  }
}
