import { STREAK_RULES } from '@/lib/streaks/streaks'

/**
 * Pure helpers for the learner dashboard (approved design, 18 November 2026).
 * No React and no database here, so each rule is unit-tested on its own.
 */

/** "Good morning" before 12:00, "Good afternoon" before 17:00, then "Good evening". */
export function greetingFor(localHour: number): string {
  if (localHour < 12) return 'Good morning'
  if (localHour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(name: string | null | undefined, username?: string | null): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  return n || (username ?? '').trim() || 'there'
}

export type DayState = 'done' | 'today' | 'missed' | 'future'

export interface WeekDay {
  /** YYYY-MM-DD in the learner's time zone */
  date: string
  /** One-letter weekday label, Monday first */
  label: string
  state: DayState
}

const LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekdayIndex(iso: string): number {
  // 0 = Monday
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7
}

/**
 * Monday-to-Sunday strip for the current week. A day counts as studied when it falls inside
 * the current streak, which ends on the last activity date. Days before the streak that have
 * already passed are missed; today is "today" until studied.
 */
export function weekStrip(todayIso: string, streak: number, lastActivityIso: string | null): WeekDay[] {
  const monday = addDays(todayIso, -weekdayIndex(todayIso))
  const studied = new Set<string>()
  if (lastActivityIso && streak > 0) {
    for (let k = 0; k < streak; k++) studied.add(addDays(lastActivityIso, -k))
  }
  return LABELS.map((label, k) => {
    const date = addDays(monday, k)
    let state: DayState
    if (studied.has(date)) state = 'done'
    else if (date === todayIso) state = 'today'
    else if (date > todayIso) state = 'future'
    else state = 'missed'
    return { date, label, state }
  })
}

/** The streak day on which the next freeze is earned (one every FREEZE_EARN_INTERVAL_DAYS). */
export function nextFreezeDay(streak: number): number {
  const every = STREAK_RULES.FREEZE_EARN_INTERVAL_DAYS
  return (Math.floor(Math.max(0, streak) / every) + 1) * every
}

/** Every XP source gets a specific label, never a generic "XP earned". */
export function xpSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case 'theory_read':
      return 'Lesson read'
    case 'quiz_correct':
      return 'Quiz answers'
    case 'quiz_bonus':
      return 'Perfect quiz bonus'
    case 'flashcard':
      return 'Flashcards reviewed'
    case 'reflection':
      return 'Reflection submitted'
    case 'capstone':
      return 'Capstone submitted'
    case 'streak':
      return 'Daily streak'
    case 'referral':
      return 'Friend joined'
    default:
      return 'XP earned'
  }
}

/** "Today, 08:40", "Yesterday, 19:05", else "12 Nov". Inputs are already in local time. */
export function relativeDayLabel(eventIso: string, todayIso: string, time: string): string {
  const day = eventIso.slice(0, 10)
  if (day === todayIso) return `Today, ${time}`
  if (day === addDays(todayIso, -1)) return `Yesterday, ${time}`
  const d = new Date(`${day}T00:00:00Z`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
