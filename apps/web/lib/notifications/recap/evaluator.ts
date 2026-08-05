import type { UserNotificationPreferences } from '../preferences/types'

export interface WeeklyRecapEvaluationParams {
  userPreferences: UserNotificationPreferences
  /**
   * Reference UTC date to evaluate eligibility against. Defaults to new Date() if omitted.
   */
  nowUtc?: Date
  /**
   * Allowed tolerance window in minutes for matching the user's preferred recap hour.
   * Default: 180 (matches within a 3-hour cron window).
   */
  toleranceWindowMinutes?: number
}

export interface WeeklyRecapEligibilityResult {
  isEligible: boolean
  reason: 'eligible' | 'notifications_disabled' | 'email_disabled' | 'category_disabled' | 'day_mismatch' | 'hour_mismatch' | 'invalid_timezone'
  userLocalTime?: string
  userLocalDay?: number
  userLocalHour?: number
}

/**
 * Checks whether a user is currently eligible for their weekly recap email based on:
 * 1. Global notification & email preferences
 * 2. Learner's local timezone (e.g. 'America/New_York', 'Asia/Kolkata', 'UTC')
 * 3. Learner's preferred recap day (default 0 = Sunday)
 * 4. Learner's preferred recap hour (default 18 = 6 PM)
 */
export function isUserEligibleForWeeklyRecap(
  params: WeeklyRecapEvaluationParams
): WeeklyRecapEligibilityResult {
  const { userPreferences: prefs, nowUtc = new Date(), toleranceWindowMinutes = 180 } = params

  // 1. Check global preference toggles
  if (!prefs.allNotifications) {
    return { isEligible: false, reason: 'notifications_disabled' }
  }
  if (!prefs.allEmail) {
    return { isEligible: false, reason: 'email_disabled' }
  }
  if (prefs.learning && !prefs.learning.email && prefs.achievements && !prefs.achievements.email) {
    // If learning category email is explicitly turned off by user
    // Note: weekly recap can still proceed if learning/recap preference is active
  }

  // 2. Resolve local time in user's timezone
  const tz = prefs.timezone || 'UTC'
  let localDateParts: { year: number; month: number; day: number; hour: number; minute: number; dayOfWeek: number }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      weekday: 'short',
      hour12: false,
    })

    const parts = formatter.formatToParts(nowUtc)
    const partMap: Record<string, string> = {}
    for (const part of parts) {
      partMap[part.type] = part.value
    }

    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }

    localDateParts = {
      year: parseInt(partMap.year || '2026', 10),
      month: parseInt(partMap.month || '1', 10),
      day: parseInt(partMap.day || '1', 10),
      hour: parseInt(partMap.hour || '0', 10) % 24,
      minute: parseInt(partMap.minute || '0', 10),
      dayOfWeek: weekdayMap[partMap.weekday || 'Sun'] ?? 0,
    }
  } catch {
    // Fallback to UTC if timezone is invalid
    localDateParts = {
      year: nowUtc.getUTCFullYear(),
      month: nowUtc.getUTCMonth() + 1,
      day: nowUtc.getUTCDate(),
      hour: nowUtc.getUTCHours(),
      minute: nowUtc.getUTCMinutes(),
      dayOfWeek: nowUtc.getUTCDay(),
    }
  }

  const targetDay = prefs.preferredRecapDay ?? 0 // Sunday default
  const targetHour = prefs.preferredRecapHour ?? 18 // 18:00 (6 PM) default

  // 3. Match Day of Week
  if (localDateParts.dayOfWeek !== targetDay) {
    return {
      isEligible: false,
      reason: 'day_mismatch',
      userLocalTime: `${localDateParts.year}-${String(localDateParts.month).padStart(2, '0')}-${String(localDateParts.day).padStart(2, '0')} ${String(localDateParts.hour).padStart(2, '0')}:${String(localDateParts.minute).padStart(2, '0')}`,
      userLocalDay: localDateParts.dayOfWeek,
      userLocalHour: localDateParts.hour,
    }
  }

  // 4. Match Hour of Day within tolerance window
  const currentTotalMinutes = localDateParts.hour * 60 + localDateParts.minute
  const targetTotalMinutes = targetHour * 60
  const minuteDiff = Math.abs(currentTotalMinutes - targetTotalMinutes)

  // Also account for midnight wrap-around if target is 0 or 23
  const wrappedDiff = Math.min(minuteDiff, 1440 - minuteDiff)

  if (wrappedDiff > toleranceWindowMinutes) {
    return {
      isEligible: false,
      reason: 'hour_mismatch',
      userLocalTime: `${localDateParts.year}-${String(localDateParts.month).padStart(2, '0')}-${String(localDateParts.day).padStart(2, '0')} ${String(localDateParts.hour).padStart(2, '0')}:${String(localDateParts.minute).padStart(2, '0')}`,
      userLocalDay: localDateParts.dayOfWeek,
      userLocalHour: localDateParts.hour,
    }
  }

  return {
    isEligible: true,
    reason: 'eligible',
    userLocalTime: `${localDateParts.year}-${String(localDateParts.month).padStart(2, '0')}-${String(localDateParts.day).padStart(2, '0')} ${String(localDateParts.hour).padStart(2, '0')}:${String(localDateParts.minute).padStart(2, '0')}`,
    userLocalDay: localDateParts.dayOfWeek,
    userLocalHour: localDateParts.hour,
  }
}
