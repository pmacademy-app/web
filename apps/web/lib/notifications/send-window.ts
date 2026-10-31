/**
 * Level-triggered send windows for the scheduled learner emails (ENG-01).
 *
 * The daily reminder, weekly recap and lifecycle crons used to send only when the learner's
 * local hour was EXACTLY their preferred hour. That is edge-triggered: one late, skipped or
 * failed scheduler run (GitHub Actions schedules are best-effort) silently dropped that day's
 * email for every learner whose hour it was.
 *
 * The window is now level-triggered: a learner is due from their preferred local hour until
 * the cutoff hour, and every hourly run in between re-checks them. Exactly-once delivery comes
 * from the idempotency key the caller already uses (per local date for daily mail, per weekly
 * anchor date for the recap), which the unique index `idx_email_queue_idempotency_key` enforces.
 * `findQueuedIdempotencyKeys` lets a cron skip learners it already queued before doing any
 * per-learner work, so the wider window does not multiply reads or skipped-event rows.
 *
 * Everything here is pure except `findQueuedIdempotencyKeys` and `findSuppressedEmails`, which
 * take the client as an argument and never throw.
 */
import type { createServiceRoleClient } from '@/lib/supabase'

/** Local hour (exclusive) after which no scheduled learner email is sent that day. */
export const DEFAULT_SEND_CUTOFF_HOUR = 22

/** The part of `UserLocalTime` (lib/notifications/timezone.ts) the daily window needs. */
export interface LocalHour {
  /** 0-23 hour in the learner's local timezone. */
  localHour: number
}

/** The part of `UserLocalTime` the weekly window needs. */
export interface LocalHourAndDay extends LocalHour {
  /** 0 (Sunday) through 6 (Saturday) in the learner's local timezone. */
  localDayOfWeek: number
}

/**
 * True when the learner's local hour is inside [preferredHour, cutoffHour).
 *
 * A preferred hour at or after the cutoff (a learner who chose 22:00 or 23:00) keeps a window
 * that runs to the end of that local day, so the preference is never unreachable.
 */
export function isInSendWindow(
  localNow: LocalHour,
  preferredHour: number,
  cutoffHour: number = DEFAULT_SEND_CUTOFF_HOUR
): boolean {
  const end = preferredHour >= cutoffHour ? 24 : cutoffHour
  return localNow.localHour >= preferredHour && localNow.localHour < end
}

/** ISO weekday index: Monday 0 .. Sunday 6, from a JS day (Sunday 0 .. Saturday 6). */
function isoWeekdayIndex(jsDay: number): number {
  return (jsDay + 6) % 7
}

/**
 * Length of the weekly recap window in local days: the anchor (preferred) day plus six catch-up
 * days. With 7 the window is rolling, so a missed run on any weekday, Sunday included, is caught
 * on a later day before the next anchor opens a new window.
 */
export const WEEKLY_CATCH_UP_DAYS = 7

/** Whole local days since the most recent preferred weekday: 0 on the anchor day, up to 6. */
function daysSinceWeeklyAnchor(localDayOfWeek: number, preferredDay: number): number {
  return (((localDayOfWeek - preferredDay) % 7) + 7) % 7
}

/**
 * Weekly recap window (S1): a rolling window keyed by the anchor, the most recent local date on
 * the preferred weekday (see `weeklyAnchorLocalDate`). It opens on the anchor day and stays open
 * on the next `WEEKLY_CATCH_UP_DAYS - 1` local days, inside the daily hour window each day.
 *
 * The later days are the catch-up: if every run on the preferred day was missed, the recap still
 * goes out before the next anchor. The window used to stop at the end of the local ISO week, so a
 * Sunday preference (the last ISO day) had no catch-up at all. The caller keys the recap on the
 * anchor date, which keeps it to one recap per window.
 */
export function isInWeeklySendWindow(
  localNow: LocalHourAndDay,
  preferredDay: number,
  preferredHour: number,
  cutoffHour: number = DEFAULT_SEND_CUTOFF_HOUR
): boolean {
  if (isoWeekdayIndex(localNow.localDayOfWeek) < isoWeekdayIndex(preferredDay)) return false
  return isInSendWindow(localNow, preferredHour, cutoffHour)
}

function parseLocalDate(localDate: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate)
  if (!m) throw new Error(`Invalid local date "${localDate}", expected YYYY-MM-DD`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Adds whole days to a YYYY-MM-DD local date. */
export function shiftLocalDate(localDate: string, days: number): string {
  return formatUtcDate(parseLocalDate(localDate) + days * DAY_MS)
}

/** ISO week of a YYYY-MM-DD local date, as `YYYY-Www` (ISO week-year, zero-padded week). */
export function localIsoWeekKey(localDate: string): string {
  const ms = parseLocalDate(localDate)
  const isoDay = isoWeekdayIndex(new Date(ms).getUTCDay())
  // The Thursday of this ISO week decides the ISO week-year.
  const thursday = new Date(ms + (3 - isoDay) * DAY_MS)
  const isoYear = thursday.getUTCFullYear()
  const jan1 = Date.UTC(isoYear, 0, 1)
  const week = Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/**
 * The weekly anchor: the most recent local date on the preferred weekday, `localDate` itself when
 * today is that weekday. The recap's idempotency key is built from it, so every run of one rolling
 * window (`isInWeeklySendWindow`) shares one key. It is also the date in the pre-ENG-01 key, which
 * was always the preferred day.
 */
export function weeklyAnchorLocalDate(localDate: string, localDayOfWeek: number, preferredDay: number): string {
  return shiftLocalDate(localDate, -daysSinceWeeklyAnchor(localDayOfWeek, preferredDay))
}

type QueueClient = ReturnType<typeof createServiceRoleClient>

/**
 * Which of `keys` already have an `email_queue` row. One query per call (callers pass one page
 * of learners, at most a few hundred keys).
 *
 * Never throws: a failed read returns an empty set, and the cron falls back to the unique index
 * on `email_queue.idempotency_key`, which still prevents a second send.
 */
export async function findQueuedIdempotencyKeys(client: QueueClient, keys: string[]): Promise<Set<string>> {
  const unique = [...new Set(keys)]
  if (unique.length === 0) return new Set()
  try {
    const { data, error } = await client.from('email_queue').select('idempotency_key').in('idempotency_key', unique)
    if (error || !data) return new Set()
    const found = new Set<string>()
    for (const row of data as Array<{ idempotency_key: string | null }>) {
      if (row.idempotency_key) found.add(row.idempotency_key)
    }
    return found
  } catch {
    return new Set()
  }
}

/**
 * Which of `emails` are on `email_suppressions` (unsubscribed, bounced, complained), lowercased
 * like the enqueue check. One query per call; callers pass the due learners of one page.
 *
 * A suppressed address never gets an `email_queue` row, so without this read every hourly run in
 * the window would repeat the per-learner work and the enqueue path would write another
 * skipped-event row (W5).
 *
 * Never throws: a failed read returns an empty set, and the enqueue path's own suppression check,
 * which fails closed, still blocks the send.
 */
export async function findSuppressedEmails(client: QueueClient, emails: string[]): Promise<Set<string>> {
  const unique = [...new Set(emails.filter(Boolean).map((e) => e.trim().toLowerCase()))]
  if (unique.length === 0) return new Set()
  try {
    const { data, error } = await client.from('email_suppressions').select('email').in('email', unique)
    if (error || !data) return new Set()
    const found = new Set<string>()
    for (const row of data as Array<{ email: string | null }>) {
      if (row.email) found.add(row.email.trim().toLowerCase())
    }
    return found
  } catch {
    return new Set()
  }
}
