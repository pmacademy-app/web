/** Milliseconds in one 24 hour day. Use calendar-date math for local "days". */
export const MS_PER_DAY = 86_400_000

interface TzParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Wall-clock fields of a Date instant in `timeZone`. */
function tzPartsOf(date: Date, timeZone: string): TzParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = get('hour')
  if (hour === 24) hour = 0 // some engines emit '24' for midnight with hour12:false
  return { year: get('year'), month: get('month'), day: get('day'), hour, minute: get('minute'), second: get('second') }
}

/** Builds the Date instant whose wall clock in `timeZone` equals `p` (iterative convergence). */
function instantFromTzParts(p: TzParts, timeZone: string): Date {
  let guess = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
  for (let i = 0; i < 3; i++) {
    const wall = tzPartsOf(guess, timeZone)
    const deltaMs =
      (p.year - wall.year) * 365 * MS_PER_DAY +
      (p.month - wall.month) * 31 * MS_PER_DAY +
      (p.day - wall.day) * MS_PER_DAY +
      (p.hour - wall.hour) * 3600_000 +
      (p.minute - wall.minute) * 60_000 +
      (p.second - wall.second) * 1000
    if (deltaMs === 0) break
    guess = new Date(guess.getTime() + deltaMs)
  }
  return guess
}

/**
 * Local start of the calendar day containing `date`, in `timeZone`. Throws a RangeError
 * for an unknown time zone, like `Intl.DateTimeFormat`.
 */
export function startOfDay(date: Date, timeZone: string): Date {
  const p = tzPartsOf(date, timeZone)
  return instantFromTzParts({ ...p, hour: 0, minute: 0, second: 0 }, timeZone)
}
