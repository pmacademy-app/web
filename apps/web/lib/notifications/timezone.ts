/**
 * Timezone utilities for notification and reminder scheduling.
 *
 * Provides IANA-compliant local time resolution using standard Intl.DateTimeFormat,
 * avoiding manual UTC offset calculations, correctly handling daylight saving transitions,
 * leap days, and international date boundaries.
 */

export interface UserLocalTime {
  /** YYYY-MM-DD in user local timezone */
  localDate: string
  /** 0-23 hour in user local timezone */
  localHour: number
  /** 0 (Sunday) through 6 (Saturday) in user local timezone */
  localDayOfWeek: number
}

/**
 * Validates whether an IANA timezone string is recognized by the runtime.
 */
export function isValidTimezone(timezone?: string | null): boolean {
  if (!timezone || typeof timezone !== 'string') return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/**
 * Resolves a date into the user's local date, hour, and day of week.
 * Safely falls back to UTC if the timezone is invalid or unrecognized.
 */
export function getUserLocalTime(timezone?: string | null, date: Date = new Date()): UserLocalTime {
  const safeTimezone = isValidTimezone(timezone) ? (timezone as string) : 'UTC'

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
    })

    const parts = formatter.formatToParts(date)
    const partMap: Record<string, string> = {}
    for (const part of parts) {
      partMap[part.type] = part.value
    }

    const year = partMap.year
    const month = partMap.month
    const day = partMap.day

    let hour = parseInt(partMap.hour || '0', 10)
    // In some Intl implementations 24:00 may be returned for midnight
    if (hour === 24) hour = 0

    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    }

    const localDayOfWeek = weekdayMap[partMap.weekday] ?? date.getUTCDay()
    const localDate = `${year}-${month}-${day}`

    return { localDate, localHour: hour, localDayOfWeek }
  } catch {
    // Ultimate defensive fallback
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return {
      localDate: `${year}-${month}-${day}`,
      localHour: date.getUTCHours(),
      localDayOfWeek: date.getUTCDay(),
    }
  }
}

/**
 * Checks whether the current moment falls within the user's local reminder hour window.
 */
export function isUserInReminderWindow(
  userTimezone?: string | null,
  preferredHour: number = 9,
  now: Date = new Date()
): { inWindow: boolean; localTime: UserLocalTime } {
  const localTime = getUserLocalTime(userTimezone, now)
  const inWindow = localTime.localHour === preferredHour
  return { inWindow, localTime }
}

/**
 * Checks whether the current moment falls within the user's local weekly recap delivery window.
 */
export function isUserInRecapWindow(
  userTimezone?: string | null,
  preferredDay: number = 0, // Sunday
  preferredHour: number = 18, // 6 PM
  now: Date = new Date()
): { inWindow: boolean; localTime: UserLocalTime } {
  const localTime = getUserLocalTime(userTimezone, now)
  const inWindow = localTime.localDayOfWeek === preferredDay && localTime.localHour === preferredHour
  return { inWindow, localTime }
}
