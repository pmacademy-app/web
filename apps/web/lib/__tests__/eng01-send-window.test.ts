/**
 * ENG-01 (Phase 2 / PR-11a): level-triggered send windows.
 *
 * The scheduled crons used to send only when the learner's local hour was EXACTLY their
 * preferred hour, so one missed or late scheduler run lost that day's email. The window is now
 * "from the preferred hour until the cutoff", and the per-local-date (or per-ISO-week)
 * idempotency key keeps it to one send.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  DEFAULT_SEND_CUTOFF_HOUR,
  findQueuedIdempotencyKeys,
  isInSendWindow,
  isInWeeklySendWindow,
  localIsoWeekKey,
  shiftLocalDate,
  weeklyAnchorLocalDate,
} from '../notifications/send-window'

describe('isInSendWindow (daily)', () => {
  it('uses a 22:00 cutoff by default', () => {
    expect(DEFAULT_SEND_CUTOFF_HOUR).toBe(22)
  })

  it('preferred hour 9: sends from 09:00 through 21:59 local', () => {
    for (let hour = 9; hour <= 21; hour++) {
      expect(isInSendWindow({ localHour: hour }, 9), `hour ${hour}`).toBe(true)
    }
  })

  it('preferred hour 9: does not send at 22:00 or later', () => {
    expect(isInSendWindow({ localHour: 22 }, 9)).toBe(false)
    expect(isInSendWindow({ localHour: 23 }, 9)).toBe(false)
  })

  it('preferred hour 9: does not send at 08:59 or earlier', () => {
    // 08:59 is local hour 8.
    expect(isInSendWindow({ localHour: 8 }, 9)).toBe(false)
    expect(isInSendWindow({ localHour: 0 }, 9)).toBe(false)
  })

  it('a preferred hour at or after the cutoff still gets its own hour', () => {
    expect(isInSendWindow({ localHour: 23 }, 23)).toBe(true)
    expect(isInSendWindow({ localHour: 22 }, 23)).toBe(false)
    expect(isInSendWindow({ localHour: 22 }, 22)).toBe(true)
  })

  it('honours a custom cutoff', () => {
    expect(isInSendWindow({ localHour: 17 }, 9, 18)).toBe(true)
    expect(isInSendWindow({ localHour: 18 }, 9, 18)).toBe(false)
  })
})

describe('isInWeeklySendWindow', () => {
  // Day numbers follow getUserLocalTime: 0 = Sunday .. 6 = Saturday.
  it('sends on the preferred day inside the hour window', () => {
    expect(isInWeeklySendWindow({ localHour: 18, localDayOfWeek: 0 }, 0, 18)).toBe(true)
    expect(isInWeeklySendWindow({ localHour: 21, localDayOfWeek: 0 }, 0, 18)).toBe(true)
  })

  it('does not send before the preferred hour or after the cutoff', () => {
    expect(isInWeeklySendWindow({ localHour: 17, localDayOfWeek: 0 }, 0, 18)).toBe(false)
    expect(isInWeeklySendWindow({ localHour: 22, localDayOfWeek: 0 }, 0, 18)).toBe(false)
  })

  it('does not send on a day earlier in the ISO week than the preferred day', () => {
    // Preferred Wednesday (3); Monday (1) and Tuesday (2) are too early.
    expect(isInWeeklySendWindow({ localHour: 10, localDayOfWeek: 1 }, 3, 9)).toBe(false)
    expect(isInWeeklySendWindow({ localHour: 10, localDayOfWeek: 2 }, 3, 9)).toBe(false)
  })

  it('catches up on a later day of the same ISO week after a missed preferred day', () => {
    // Preferred Wednesday; Thursday and Sunday (end of the ISO week) still qualify.
    expect(isInWeeklySendWindow({ localHour: 10, localDayOfWeek: 4 }, 3, 9)).toBe(true)
    expect(isInWeeklySendWindow({ localHour: 10, localDayOfWeek: 0 }, 3, 9)).toBe(true)
  })

  it('a Sunday preference never matches Monday to Saturday (Sunday ends the ISO week)', () => {
    for (let day = 1; day <= 6; day++) {
      expect(isInWeeklySendWindow({ localHour: 19, localDayOfWeek: day }, 0, 18), `day ${day}`).toBe(false)
    }
  })
})

describe('local date helpers', () => {
  it('localIsoWeekKey returns the ISO week-year and week', () => {
    expect(localIsoWeekKey('2026-10-24')).toBe('2026-W43') // Saturday
    expect(localIsoWeekKey('2026-10-25')).toBe('2026-W43') // Sunday ends the same ISO week
    expect(localIsoWeekKey('2026-10-26')).toBe('2026-W44') // Monday starts the next
    // ISO week-year boundaries.
    expect(localIsoWeekKey('2021-01-03')).toBe('2020-W53')
    expect(localIsoWeekKey('2024-12-30')).toBe('2025-W01')
  })

  it('shiftLocalDate moves across month and year boundaries', () => {
    expect(shiftLocalDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftLocalDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('weeklyAnchorLocalDate is the preferred day inside the current ISO week', () => {
    // Saturday 2026-10-24 with a Wednesday preference -> Wednesday 2026-10-21.
    expect(weeklyAnchorLocalDate('2026-10-24', 6, 3)).toBe('2026-10-21')
    // Sunday preference on the Sunday itself.
    expect(weeklyAnchorLocalDate('2026-10-25', 0, 0)).toBe('2026-10-25')
  })

  it('rejects malformed dates', () => {
    expect(() => localIsoWeekKey('24/10/2026')).toThrow()
  })
})

describe('second invocation on the same local date does not enqueue', () => {
  /**
   * A fake email_queue keyed by idempotency key, standing in for the unique index
   * idx_email_queue_idempotency_key. The cron asks which keys are already queued and skips
   * those learners before calling the enqueue path.
   */
  function fakeQueue() {
    const rows = new Set<string>()
    const client = {
      from: vi.fn((table: string) => {
        expect(table).toBe('email_queue')
        return {
          select: () => ({
            in: async (_col: string, keys: string[]) => ({
              data: keys.filter((k) => rows.has(k)).map((k) => ({ idempotency_key: k })),
              error: null,
            }),
          }),
        }
      }),
    }
    return { rows, client }
  }

  /** The decision every scheduled cron makes per learner, reduced to its essentials. */
  async function hourlyRun(queue: ReturnType<typeof fakeQueue>, localHour: number, localDate: string) {
    const key = `daily-reminder-user-1-${localDate}`
    if (!isInSendWindow({ localHour }, 9)) return 'outside_window'
    const queued = await findQueuedIdempotencyKeys(queue.client as never, [key])
    if (queued.has(key)) return 'already_queued'
    queue.rows.add(key)
    return 'enqueued'
  }

  beforeEach(() => vi.clearAllMocks())

  it('enqueues once at the first in-window run and skips every later run that day', async () => {
    const queue = fakeQueue()
    expect(await hourlyRun(queue, 8, '2026-10-24')).toBe('outside_window')
    expect(await hourlyRun(queue, 9, '2026-10-24')).toBe('enqueued')
    expect(await hourlyRun(queue, 10, '2026-10-24')).toBe('already_queued')
    expect(await hourlyRun(queue, 21, '2026-10-24')).toBe('already_queued')
    expect(queue.rows.size).toBe(1)
  })

  it('a missed preferred-hour run is recovered by a later run the same day', async () => {
    const queue = fakeQueue()
    // The 09:30 and 10:30 runs never happened; the 13:30 run still sends.
    expect(await hourlyRun(queue, 13, '2026-10-24')).toBe('enqueued')
    expect(queue.rows.size).toBe(1)
  })

  it('the next local date is a fresh key', async () => {
    const queue = fakeQueue()
    expect(await hourlyRun(queue, 9, '2026-10-24')).toBe('enqueued')
    expect(await hourlyRun(queue, 9, '2026-10-25')).toBe('enqueued')
    expect(queue.rows.size).toBe(2)
  })

  it('a failed lookup returns no keys (the unique index still guards the insert)', async () => {
    const broken = { from: () => ({ select: () => ({ in: async () => ({ data: null, error: { message: 'boom' } }) }) }) }
    expect((await findQueuedIdempotencyKeys(broken as never, ['k'])).size).toBe(0)
    const throwing = { from: () => { throw new Error('no table') } }
    expect((await findQueuedIdempotencyKeys(throwing as never, ['k'])).size).toBe(0)
  })

  it('an empty key list makes no query', async () => {
    const queue = fakeQueue()
    expect((await findQueuedIdempotencyKeys(queue.client as never, [])).size).toBe(0)
    expect(queue.client.from).not.toHaveBeenCalled()
  })
})
