import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const requireAdminUser = vi.fn()
const logSystemError = vi.fn()

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
  logAdminAction: vi.fn(),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: (entry: unknown) => logSystemError(entry),
  logErrorReport: vi.fn(),
}))

vi.mock('@/lib/notifications/queue/processor', () => ({
  processEmailQueue: vi.fn(async () => ({ processed: 3, failed: 0 })),
  enqueueNotificationItem: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/admin/broadcast-service', () => ({
  BroadcastService: { processScheduledBroadcasts: vi.fn(async () => ({ processed: 1, errors: 0 })) },
}))

vi.mock('@/lib/admin/in-app-manager-service', () => ({
  InAppManagerService: { processScheduledInAppBroadcasts: vi.fn(async () => ({ processed: 2, errors: 0 })) },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isAutomationEnabled: vi.fn(async () => false),
    isGlobalPauseActive: vi.fn(async () => false),
    getDigestSchedules: vi.fn(async () => ({
      dailyReminder: { enabled: false, hourUtc: 3 },
      weeklyRecap: { enabled: false, hourUtc: 3, dayOfWeek: 1 },
    })),
    recordDigestRun: vi.fn(),
  },
}))

const CRON_SECRET = 'b7c-cron-secret-under-test'

const { POST: cleanup } = await import('../../app/api/cron/cleanup/route')
const { POST: dailyReminder } = await import('../../app/api/cron/daily-reminder/route')
const { GET: processBroadcasts } = await import('../../app/api/cron/process-broadcasts/route')
const { POST: processEmailQueue } = await import('../../app/api/cron/process-email-queue/route')
const { POST: retryFailed } = await import('../../app/api/cron/retry-failed/route')
const { POST: weeklyRecap } = await import('../../app/api/cron/weekly-recap/route')

const ROUTES = [
  { name: 'cleanup', handler: cleanup, url: 'https://prodily.app/api/cron/cleanup' },
  { name: 'daily-reminder', handler: dailyReminder, url: 'https://prodily.app/api/cron/daily-reminder' },
  { name: 'process-broadcasts', handler: processBroadcasts, url: 'https://prodily.app/api/cron/process-broadcasts' },
  { name: 'process-email-queue', handler: processEmailQueue, url: 'https://prodily.app/api/cron/process-email-queue' },
  { name: 'retry-failed', handler: retryFailed, url: 'https://prodily.app/api/cron/retry-failed' },
  { name: 'weekly-recap', handler: weeklyRecap, url: 'https://prodily.app/api/cron/weekly-recap' },
] as const

/** The exact call the notification-scheduler workflow makes. */
function schedulerRequest(url: string, secret = CRON_SECRET): Request {
  return new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  requireAdminUser.mockReset().mockResolvedValue({
    authorized: false,
    error: 'Authentication required',
    statusCode: 401,
  })
  logSystemError.mockReset().mockResolvedValue(undefined)
  process.env.CRON_SECRET = CRON_SECRET
})

describe('B7-C — the scheduler call shape still succeeds', () => {
  for (const route of ROUTES) {
    it(`${route.name} accepts the workflow's bearer token`, async () => {
      const res = await route.handler(schedulerRequest(route.url))

      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })
  }
})

describe('B7-C — a wrong secret is rejected', () => {
  for (const route of ROUTES) {
    it(`${route.name} rejects a wrong secret with the canonical envelope`, async () => {
      const res = await route.handler(schedulerRequest(route.url, 'not-the-secret'))
      const body = await res.json()

      expect(res.status).toBe(401)
      expect(body.success).toBe(false)
      expect(body.code).toBe('UNAUTHORIZED')
    })
  }

  for (const route of ROUTES) {
    it(`${route.name} rejects a secret sharing a prefix with the real one`, async () => {
      const res = await route.handler(schedulerRequest(route.url, CRON_SECRET.slice(0, -1)))

      expect(res.status).toBe(401)
    })
  }
})

describe('B7-C — an admin session is still accepted', () => {
  for (const route of ROUTES) {
    it(`${route.name} accepts an authenticated admin with no cron secret configured`, async () => {
      delete process.env.CRON_SECRET
      requireAdminUser.mockResolvedValue({
        authorized: true,
        userId: 'admin_123',
        email: 'admin@prodily.app',
      })

      const res = await route.handler(new Request(route.url, { method: 'POST' }))

      expect(res.status).toBe(200)
      expect((await res.json()).success).toBe(true)
    })
  }
})

describe('B7-C — authorization was not widened', () => {
  for (const route of ROUTES) {
    it(`${route.name} rejects an anonymous caller when no secret is configured`, async () => {
      delete process.env.CRON_SECRET

      const res = await route.handler(new Request(route.url, { method: 'POST' }))

      expect(res.status).toBe(401)
    })
  }

  for (const route of ROUTES) {
    it(`${route.name} rejects an authenticated non-admin with 403`, async () => {
      requireAdminUser.mockResolvedValue({
        authorized: false,
        error: 'Access denied: Admin privileges required',
        statusCode: 403,
      })

      const res = await route.handler(schedulerRequest(route.url, 'wrong'))

      expect(res.status).toBe(403)
      expect((await res.json()).code).toBe('FORBIDDEN')
    })
  }

  it('no cron route leaks the internal denial reason', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    for (const route of ROUTES) {
      const res = await route.handler(schedulerRequest(route.url, 'wrong'))
      expect(JSON.stringify(await res.json())).not.toContain('Admin privileges required')
    }
  })
})

describe('B7-C — unauthorized-attempt logging survived the migration', () => {
  const LOGGING_ROUTES = [
    { name: 'daily-reminder', handler: dailyReminder, operation: 'cron_daily_reminder_auth' },
    { name: 'process-email-queue', handler: processEmailQueue, operation: 'cron_process_queue_auth' },
    { name: 'retry-failed', handler: retryFailed, operation: 'cron_retry_failed_auth' },
    { name: 'weekly-recap', handler: weeklyRecap, operation: 'cron_weekly_recap_auth' },
  ] as const

  for (const route of LOGGING_ROUTES) {
    it(`${route.name} records the denial with its original operation name`, async () => {
      const res = await route.handler(
        schedulerRequest(`https://prodily.app/api/cron/${route.name}`, 'wrong')
      )

      expect(res.status).toBe(401)
      expect(logSystemError).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'warning',
          category: 'cron',
          operation: route.operation,
        })
      )
    })
  }

  it('the two routes that never logged a denial still do not', async () => {
    await cleanup(schedulerRequest('https://prodily.app/api/cron/cleanup', 'wrong'))
    await processBroadcasts(schedulerRequest('https://prodily.app/api/cron/process-broadcasts', 'wrong'))

    expect(logSystemError).not.toHaveBeenCalled()
  })

  it('does not log a denial when the request is authorized', async () => {
    await retryFailed(schedulerRequest('https://prodily.app/api/cron/retry-failed'))

    expect(logSystemError).not.toHaveBeenCalled()
  })
})

describe('B7-C — success response shapes are unchanged', () => {
  it('cleanup still reports the not-implemented retention no-op', async () => {
    const body = await (await cleanup(schedulerRequest('https://prodily.app/api/cron/cleanup'))).json()

    expect(body).toMatchObject({ success: true, implemented: false, cleanedRows: 0 })
    expect(body.note).toContain('Retention cleanup is not implemented')
  })

  it('retry-failed still reports processed and its honesty note', async () => {
    const body = await (
      await retryFailed(schedulerRequest('https://prodily.app/api/cron/retry-failed'))
    ).json()

    expect(body).toMatchObject({ success: true, processed: 3 })
    expect(body.note).toContain('performs no dead-letter recovery')
  })

  it('process-email-queue still reports durationMs and the processor result', async () => {
    const body = await (
      await processEmailQueue(schedulerRequest('https://prodily.app/api/cron/process-email-queue'))
    ).json()

    expect(body.success).toBe(true)
    expect(typeof body.durationMs).toBe('number')
    expect(body.result).toEqual({ processed: 3, failed: 0 })
  })

  it('process-broadcasts still reports both broadcast channels', async () => {
    const body = await (
      await processBroadcasts(schedulerRequest('https://prodily.app/api/cron/process-broadcasts'))
    ).json()

    expect(body.emailBroadcasts).toEqual({ processed: 1, errors: 0 })
    expect(body.inAppBroadcasts).toEqual({ processed: 2, errors: 0 })
  })

  it('the digest routes still short-circuit when their automation is disabled', async () => {
    const daily = await (
      await dailyReminder(schedulerRequest('https://prodily.app/api/cron/daily-reminder'))
    ).json()
    const weekly = await (
      await weeklyRecap(schedulerRequest('https://prodily.app/api/cron/weekly-recap'))
    ).json()

    expect(daily).toMatchObject({ success: true, remindersQueued: 0 })
    expect(daily.message).toContain('disabled')
    expect(weekly).toMatchObject({ success: true, recapsQueued: 0 })
    expect(weekly.message).toContain('disabled')
  })

  it('the force query flag is still honoured after moving into the contract', async () => {
    const res = await dailyReminder(
      new Request('https://prodily.app/api/cron/daily-reminder?force=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
    )

    // Automation is disabled in this suite, so force cannot change the outcome —
    // what matters is that an arbitrary query value is still accepted rather than
    // rejected as a validation error.
    expect(res.status).toBe(200)
  })

  it('an unexpected force value is accepted, not rejected as invalid', async () => {
    const res = await dailyReminder(
      new Request('https://prodily.app/api/cron/daily-reminder?force=banana', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      })
    )

    expect(res.status).toBe(200)
  })
})

describe('B7-C — migration scope', () => {
  const API_DIR = path.resolve(import.meta.dirname, '../../app/api')

  function routeFilesImporting(needle: string): string[] {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts' && readFileSync(full, 'utf8').includes(needle)) {
          hits.push(path.relative(API_DIR, full).replace(/\\/g, '/'))
        }
      }
    }
    walk(API_DIR)
    return hits.sort()
  }

  it('exactly the six cron routes use the wrapper — no later wave was touched', () => {
    expect(routeFilesImporting('@/lib/api/with-route')).toEqual([
      'cron/cleanup/route.ts',
      'cron/daily-reminder/route.ts',
      'cron/process-broadcasts/route.ts',
      'cron/process-email-queue/route.ts',
      'cron/retry-failed/route.ts',
      'cron/weekly-recap/route.ts',
    ])
  })

  it('no cron route hand-rolls a secret comparison any more', () => {
    const cronDir = path.join(API_DIR, 'cron')
    for (const entry of readdirSync(cronDir)) {
      const source = readFileSync(path.join(cronDir, entry, 'route.ts'), 'utf8')
      // The doc comments still name CRON_SECRET; what must be gone is the route
      // reading and comparing it itself.
      expect(source).not.toContain('process.env.CRON_SECRET')
      expect(source).not.toContain('requireAdminUser')
      expect(source).not.toMatch(/`Bearer \$\{/)
    }
  })

  it('no cron route reads a secret from the query string', () => {
    const cronDir = path.join(API_DIR, 'cron')
    for (const entry of readdirSync(cronDir)) {
      const source = readFileSync(path.join(cronDir, entry, 'route.ts'), 'utf8')
      expect(source).not.toMatch(/searchParams\.get\(\s*['"](secret|token|key)['"]\s*\)/)
    }
  })
})
