/**
 * ENG-01 (Phase 2 / PR-11a): per-job cron heartbeats and stale detection.
 *
 * Before this, only process-email-queue wrote a heartbeat, and nothing alerted when a job
 * stopped running. Every scheduled route now records `cron_heartbeat:<job>`, and the
 * five-minute queue run checks them: a job whose last success is older than twice its interval
 * raises exactly one out-of-band alert per stale episode.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CRON_JOB_DEFINITIONS,
  CRON_JOB_INTERVALS_MINUTES,
  checkStaleHeartbeats,
  evaluateHeartbeat,
  heartbeatKey,
  recordCronHeartbeat,
  withCronHeartbeat,
  type CronHeartbeat,
} from '../monitoring/cron-heartbeat'

const NOW = new Date('2026-10-24T12:00:00.000Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()

/** In-memory system_settings supporting the calls the heartbeat module makes. */
function fakeSettings(initial: Record<string, unknown> = {}) {
  const rows = new Map<string, unknown>(Object.entries(initial))
  const client = {
    from: vi.fn((table: string) => {
      expect(table).toBe('system_settings')
      return {
        select: () => ({
          eq: (_col: string, key: string) => ({
            maybeSingle: async () => ({ data: rows.has(key) ? { value: rows.get(key) } : null, error: null }),
          }),
        }),
        upsert: async (row: { key: string; value: unknown }) => {
          rows.set(row.key, row.value)
          return { error: null }
        },
      }
    }),
  }
  return { rows, client }
}

function beat(partial: Partial<CronHeartbeat>): CronHeartbeat {
  return { job: 'process-email-queue', status: 'healthy', last_run_at: minutesAgo(1), ...partial } as CronHeartbeat
}

describe('job registry', () => {
  it('covers all seven cron routes with the scheduler cadence', () => {
    expect(CRON_JOB_DEFINITIONS.map((j) => j.job).sort()).toEqual(
      ['cleanup', 'daily-reminder', 'lifecycle', 'process-broadcasts', 'process-email-queue', 'retry-failed', 'weekly-recap'].sort()
    )
    expect(CRON_JOB_INTERVALS_MINUTES['process-email-queue']).toBe(5)
    expect(CRON_JOB_INTERVALS_MINUTES['process-broadcasts']).toBe(5)
    expect(CRON_JOB_INTERVALS_MINUTES['daily-reminder']).toBe(60)
    expect(CRON_JOB_INTERVALS_MINUTES['weekly-recap']).toBe(60)
    expect(CRON_JOB_INTERVALS_MINUTES.lifecycle).toBe(60)
    expect(CRON_JOB_INTERVALS_MINUTES.cleanup).toBe(1440)
    // Deprecated and manual only: never expected to run, so never stale.
    expect(CRON_JOB_INTERVALS_MINUTES['retry-failed']).toBeNull()
  })

  it('keeps the historical key for the queue heartbeat', () => {
    expect(heartbeatKey('process-email-queue')).toBe('cron_heartbeat:process-email-queue')
  })
})

describe('evaluateHeartbeat', () => {
  it('is fresh up to twice the interval and stale after it', () => {
    expect(evaluateHeartbeat(beat({ last_success_at: minutesAgo(10) }), 5, NOW).state).toBe('fresh')
    expect(evaluateHeartbeat(beat({ last_success_at: minutesAgo(11) }), 5, NOW).state).toBe('stale')
  })

  it('reports a missing row as missing, not stale', () => {
    expect(evaluateHeartbeat(null, 5, NOW).state).toBe('missing')
  })

  it('does not monitor a job without an interval', () => {
    expect(evaluateHeartbeat(beat({ last_success_at: minutesAgo(9999) }), null, NOW).state).toBe('unmonitored')
  })

  it('a job that only ever failed is measured from its first run', () => {
    const failing = beat({ status: 'failed', last_run_at: minutesAgo(1), first_run_at: minutesAgo(30) })
    expect(evaluateHeartbeat(failing, 5, NOW).state).toBe('stale')
  })
})

describe('recordCronHeartbeat', () => {
  it('keeps last_success_at through a failed run and drops it from nothing', async () => {
    const { rows, client } = fakeSettings()
    await recordCronHeartbeat('daily-reminder', 'healthy', { last_duration_ms: 10 }, { client: client as never, now: new Date(minutesAgo(30)) })
    await recordCronHeartbeat('daily-reminder', 'failed', { error: 'boom' }, { client: client as never, now: NOW })

    const hb = rows.get('cron_heartbeat:daily-reminder') as CronHeartbeat
    expect(hb.status).toBe('failed')
    expect(hb.last_run_at).toBe(NOW.toISOString())
    expect(hb.last_success_at).toBe(minutesAgo(30))
    expect(hb.first_run_at).toBe(minutesAgo(30))
    expect(hb.error).toBe('boom')
  })

  it('a healthy run clears the previous error', async () => {
    const { rows, client } = fakeSettings({ 'cron_heartbeat:cleanup': beat({ job: 'cleanup', status: 'failed', error: 'old' }) })
    await recordCronHeartbeat('cleanup', 'healthy', {}, { client: client as never, now: NOW })
    const hb = rows.get('cron_heartbeat:cleanup') as CronHeartbeat
    expect(hb.status).toBe('healthy')
    expect(hb.error).toBeUndefined()
    expect(hb.last_success_at).toBe(NOW.toISOString())
  })

  it('never throws when the database is unreachable', async () => {
    const broken = { from: () => { throw new Error('db down') } }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(recordCronHeartbeat('lifecycle', 'healthy', {}, { client: broken as never })).resolves.toBeUndefined()
    warn.mockRestore()
  })
})

describe('withCronHeartbeat', () => {
  it('records healthy on success and failed (then rethrows) on an exception', async () => {
    const { rows, client } = fakeSettings()
    const res = await withCronHeartbeat('weekly-recap', async () => new Response('{}', { status: 200 }), { client: client as never })
    expect(res.status).toBe(200)
    expect((rows.get('cron_heartbeat:weekly-recap') as CronHeartbeat).status).toBe('healthy')

    await expect(
      withCronHeartbeat('weekly-recap', async () => { throw new Error('exploded') }, { client: client as never })
    ).rejects.toThrow('exploded')
    const hb = rows.get('cron_heartbeat:weekly-recap') as CronHeartbeat
    expect(hb.status).toBe('failed')
    expect(hb.error).toBe('exploded')
  })

  it('treats a 5xx response as a failed run', async () => {
    const { rows, client } = fakeSettings()
    await withCronHeartbeat('process-broadcasts', async () => new Response('{}', { status: 500 }), { client: client as never })
    expect((rows.get('cron_heartbeat:process-broadcasts') as CronHeartbeat).status).toBe('failed')
  })
})

describe('checkStaleHeartbeats', () => {
  const allFresh = () =>
    Object.fromEntries(
      CRON_JOB_DEFINITIONS.map((j) => [heartbeatKey(j.job), beat({ job: j.job, last_success_at: minutesAgo(1) })])
    )

  it('a stale job (older than 2x interval) raises exactly one alert, across repeated checks', async () => {
    const { client } = fakeSettings({
      ...allFresh(),
      'cron_heartbeat:daily-reminder': beat({ job: 'daily-reminder', last_run_at: minutesAgo(121), last_success_at: minutesAgo(121) }),
    })
    const deliver = vi.fn().mockResolvedValue({ delivered: true })

    const first = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    const second = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: new Date(NOW.getTime() + 5 * 60_000), deliver })

    expect(first.stale).toEqual(['daily-reminder'])
    expect(first.alerted).toEqual(['daily-reminder'])
    expect(second.stale).toEqual(['daily-reminder'])
    expect(second.alerted).toEqual([])
    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver.mock.calls[0][0]).toMatchObject({ operation: 'cron.daily-reminder.heartbeat', domain: 'cron' })
  })

  it('fresh heartbeats raise no alert', async () => {
    const { client } = fakeSettings(allFresh())
    const deliver = vi.fn().mockResolvedValue({ delivered: true })
    const result = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    expect(result.stale).toEqual([])
    expect(deliver).not.toHaveBeenCalled()
  })

  it('missing heartbeats (job not yet deployed or never run) raise no alert', async () => {
    const { client } = fakeSettings({})
    const deliver = vi.fn().mockResolvedValue({ delivered: true })
    const result = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    expect(result.stale).toEqual([])
    expect(deliver).not.toHaveBeenCalled()
  })

  it('a new stale episode after recovery alerts again', async () => {
    const { rows, client } = fakeSettings({
      ...allFresh(),
      'cron_heartbeat:cleanup': beat({ job: 'cleanup', last_success_at: minutesAgo(3000) }),
    })
    const deliver = vi.fn().mockResolvedValue({ delivered: true })
    // Only the cleanup job is checked here, so the other jobs ageing past `later` do not count.
    const onlyCleanup = { cleanup: 1440 }
    await checkStaleHeartbeats(onlyCleanup, { client: client as never, now: NOW, deliver })
    await checkStaleHeartbeats(onlyCleanup, { client: client as never, now: NOW, deliver })
    expect(deliver).toHaveBeenCalledTimes(1)

    // The job recovers, then stalls again: a later success is a new episode.
    rows.set('cron_heartbeat:cleanup', beat({ job: 'cleanup', last_success_at: minutesAgo(1) }))
    const later = new Date(NOW.getTime() + 3000 * 60_000)
    await checkStaleHeartbeats(onlyCleanup, { client: client as never, now: later, deliver })
    expect(deliver).toHaveBeenCalledTimes(2)
  })

  it('a failed delivery is retried on the next check, not marked as sent', async () => {
    const { client } = fakeSettings({
      ...allFresh(),
      'cron_heartbeat:lifecycle': beat({ job: 'lifecycle', last_success_at: minutesAgo(200) }),
    })
    const deliver = vi.fn().mockResolvedValueOnce({ delivered: false, reason: 'failed' }).mockResolvedValue({ delivered: true })
    const a = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    const b = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    const c = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: client as never, now: NOW, deliver })
    expect(a.alerted).toEqual([])
    expect(b.alerted).toEqual(['lifecycle'])
    expect(c.alerted).toEqual([])
    expect(deliver).toHaveBeenCalledTimes(2)
  })

  it('never throws when the settings read fails', async () => {
    const broken = { from: () => { throw new Error('db down') } }
    const deliver = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await checkStaleHeartbeats(CRON_JOB_INTERVALS_MINUTES, { client: broken as never, now: NOW, deliver })
    warn.mockRestore()
    expect(result.stale).toEqual([])
    expect(deliver).not.toHaveBeenCalled()
  })
})
