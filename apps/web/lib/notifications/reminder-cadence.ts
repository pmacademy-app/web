/**
 * Daily-reminder cadence (PROD-05, owner decision Q8).
 *
 * The daily reminder used to go out every day for as long as a learner had due cards, so a
 * learner who lapsed got the same nudge forever. The cadence now backs off with time since
 * the learner's last activity: one reminder a day for days 0 to 3, then one on days 7, 14
 * and 30, then none. Activity resets the count, so a returning learner starts again at day 0.
 *
 * Everything here is pure; the cron supplies the dates.
 */
import { daysBetweenLocalDates } from '@/lib/notifications/lifecycle/segments'
import { getLocalDateString } from '@/lib/streaks/streaks'

/** Last day (inclusive) of the daily phase, counted in whole local days since last activity. */
export const REMINDER_DAILY_PHASE_MAX_DAYS = 3

/** Days after the daily phase on which one more reminder is sent. Nothing is sent after the last. */
export const REMINDER_FOLLOW_UP_DAYS: readonly number[] = [7, 14, 30]

/**
 * True when a learner `daysSinceLastActivity` whole local days past their last activity is due
 * a reminder under the cadence.
 *
 * `null` means the age is unknown (no last activity and no readable signup date). Signup date is
 * NOT NULL in the schema, so this only happens for a malformed row; it is treated as day 0 so a
 * new learner is never silently dropped. A negative value (a last activity date ahead of the
 * learner's local today after a timezone change) is also treated as day 0.
 */
export function shouldSendReminder(
  daysSinceLastActivity: number | null,
  dailyPhaseMaxDays: number = REMINDER_DAILY_PHASE_MAX_DAYS,
  followUpDays: readonly number[] = REMINDER_FOLLOW_UP_DAYS
): boolean {
  if (daysSinceLastActivity === null || !Number.isFinite(daysSinceLastActivity)) return true
  const days = Math.max(0, Math.floor(daysSinceLastActivity))
  if (days <= dailyPhaseMaxDays) return true
  return followUpDays.includes(days)
}

/**
 * Whole local days between the learner's last activity and `localDate` (their local today).
 *
 * Last activity is `last_streak_date` (already a local YYYY-MM-DD written by the streak engine).
 * A learner who has never been active is counted from signup: `created_at` converted to a local
 * date in their timezone. Returns `null` when neither date can be read.
 */
export function daysSinceLastActivity(input: {
  lastStreakDate: string | null | undefined
  createdAt: string | null | undefined
  localDate: string
  timezone: string
}): number | null {
  if (input.lastStreakDate) {
    const days = daysBetweenLocalDates(input.localDate, input.lastStreakDate)
    if (days !== null) return days
  }
  if (input.createdAt) {
    const created = new Date(input.createdAt)
    if (Number.isNaN(created.getTime())) return null
    return daysBetweenLocalDates(input.localDate, getLocalDateString(input.timezone, created))
  }
  return null
}
