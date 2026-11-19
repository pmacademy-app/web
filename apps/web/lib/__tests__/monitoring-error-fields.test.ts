import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Shared monitoring contract (learner `web` and the separate admin repo read the
 * same `system_errors` rows):
 *
 *   A. details carries `stack` (redacted, at most 30 frames and 4000 characters),
 *      `release` (12-character commit), `app` ('web'), `runtime` and, for browser
 *      reports, `source`.
 *   B. `user_id` is filled from a server-resolved user, never a client-sent one.
 *   C. A fingerprint on the admin ignore list is recorded but never alerts.
 *   D. A fingerprint whose latest row is resolved gets a new regression row.
 *   E. The 15-minute dedup window runs from the row's `updated_at` (last seen).
 *
 * Plus the browser side: the beacon's new fields, its cap and dedupe, noise
 * filtering, the window listeners being installed once, and the route's global cap.
 */

// ─── Fakes ────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  fingerprint: string
  occurrence_count: number
  status: string
  timestamp: string
  updated_at: string
  [key: string]: unknown
}

const db = {
  rows: [] as Row[],
  inserted: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
  settings: new Map<string, unknown>(),
  settingsReads: 0,
  settingsFail: false,
  insertFailOnceWith: null as null | { code: string; message: string },
}

function resetDb() {
  db.rows = []
  db.inserted = []
  db.updates = []
  db.settings = new Map()
  db.settingsReads = 0
  db.settingsFail = false
  db.insertFailOnceWith = null
}

function fakeClient() {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (col: string, val: unknown) => {
      filters[col] = val
      return builder
    }
    builder.neq = (col: string, val: unknown) => {
      filters[`neq_${col}`] = val
      return builder
    }
    builder.gte = () => builder
    builder.order = () => builder
    builder.limit = async (n: number) => {
      if (table === 'users') return { data: [], error: null }
      if (table !== 'system_errors') return { data: [], error: null }
      let matched = db.rows.filter((r) => !filters.fingerprint || r.fingerprint === filters.fingerprint)
      if (filters.neq_id) matched = matched.filter((r) => r.id !== filters.neq_id)
      matched = [...matched].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      return { data: matched.slice(0, n), error: null }
    }
    builder.maybeSingle = async () => {
      if (table === 'system_settings') {
        db.settingsReads++
        if (db.settingsFail) return { data: null, error: { message: 'settings down' } }
        const key = String(filters.key)
        return { data: db.settings.has(key) ? { value: db.settings.get(key) } : null, error: null }
      }
      return { data: null, error: null }
    }
    builder.insert = (payload: Record<string, unknown>) => ({
      select: () => ({
        maybeSingle: async () => {
          if (table !== 'system_errors') return { data: null, error: null }
          if (db.insertFailOnceWith) {
            const error = db.insertFailOnceWith
            db.insertFailOnceWith = null
            return { data: null, error }
          }
          const now = new Date().toISOString()
          const row: Row = {
            ...payload,
            id: `row-${db.rows.length + 1}`,
            fingerprint: String(payload.fingerprint),
            occurrence_count: Number(payload.occurrence_count ?? 1),
            status: String(payload.status ?? 'new'),
            timestamp: now,
            updated_at: now,
          }
          db.rows.push(row)
          db.inserted.push(payload)
          return { data: { id: row.id }, error: null }
        },
      }),
    })
    builder.update = (payload: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        db.updates.push({ id, ...payload })
        const row = db.rows.find((r) => r.id === id)
        if (row) Object.assign(row, payload)
        return { data: null, error: null }
      },
    })
    return builder
  }
  return { from }
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => fakeClient()),
}))

const deliverOutOfBandAlert = vi.fn(async () => ({ delivered: true }))
vi.mock('@/lib/monitoring/out-of-band-alert', () => ({
  deliverOutOfBandAlert: (...args: unknown[]) => deliverOutOfBandAlert(...(args as [])),
}))

vi.mock('@/lib/notifications/in-app/service', () => ({
  createInAppNotification: vi.fn(async () => ({})),
}))

const evaluatePersistentRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (key: string, opts: unknown) => evaluatePersistentRateLimit(key, opts),
}))

const LEARNER_ID = '6f1c2f28-6a1e-4a1a-9c1d-2b7e4d5a6c7f'
const getAuthenticatedUserFromRequest = vi.fn(async (): Promise<unknown> => null)
vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: () => getAuthenticatedUserFromRequest(),
}))

const logger = await import('@/lib/monitoring/logger')
const beacon = await import('@/lib/monitoring/client-error-beacon')
const { onRequestError } = await import('../../instrumentation')
const { POST } = await import('../../app/api/client-errors/route')
const { withRoute } = await import('@/lib/api/with-route')

// Synthetic test JWT for verifying redaction (not a real credential)
// gitleaks:allow
const JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'c2lnbmF0dXJlLXZhbHVl'].join('.')

const SHA = '0123456789abcdef0123456789abcdef01234567'

function errorWithStack(message: string, frames: number, frameText = 'at fn (/srv/app.js:1:2)'): Error {
  const error = new Error(message)
  error.stack = [`Error: ${message}`, ...Array.from({ length: frames }, (_, i) => `    ${frameText} #${i}`)].join('\n')
  return error
}

beforeEach(() => {
  resetDb()
  logger.resetIgnoredFingerprintsCacheForTests()
  deliverOutOfBandAlert.mockClear()
  evaluatePersistentRateLimit.mockReset().mockResolvedValue({ success: true, remaining: 9, resetInMs: 60_000 })
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(null)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubEnv('NEXT_RUNTIME', 'nodejs')
  vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
  vi.stubEnv('ALLOW_TEST_ADMIN_NOTIFICATIONS', 'true')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function details(index = 0): Record<string, unknown> {
  return db.inserted[index].details as Record<string, unknown>
}

// ─── A. details fields ───────────────────────────────────────────────────────

describe('logger: shared details fields', () => {
  it('stores a redacted stack, app and runtime from an error option', async () => {
    const error = errorWithStack(`token leaked ${JWT}`, 3, `at handler (/srv/api.js:4:2) learner@example.com`)

    await logger.logErrorReport({
      domain: 'api',
      kind: 'unexpected',
      operation: 'thing.do',
      summary: 'Unhandled exception in thing.do',
      error,
    })

    const d = details()
    expect(d.app).toBe('web')
    expect(d.runtime).toBe('server')
    expect(typeof d.stack).toBe('string')
    expect(d.stack).toContain('at handler')
    expect(d.stack).not.toContain(JWT)
    expect(d.stack).toContain('[REDACTED_JWT]')
    expect(d.stack).not.toContain('learner@example.com')
  })

  it('keeps at most 30 frames and 4000 characters', async () => {
    await logger.logSystemError({
      severity: 'error',
      category: 'api',
      operation: 'stack.frames',
      message: 'many frames',
      error: errorWithStack('many frames', 80),
    })
    const framed = String(details().stack)
    expect(framed.split('\n').filter((l) => /^\s*at\s/.test(l))).toHaveLength(logger.MAX_STACK_FRAMES)

    resetDb()
    await logger.logSystemError({
      severity: 'error',
      category: 'api',
      operation: 'stack.length',
      message: 'long frames',
      error: errorWithStack('long frames', 30, `at ${'x'.repeat(500)} (/srv/a.js:1:1)`),
    })
    expect(String(details().stack).length).toBe(logger.MAX_STACK_LENGTH)
  })

  it('omits the stack when the thrown value has none', async () => {
    await logger.logErrorReport({
      domain: 'api',
      kind: 'unexpected',
      operation: 'thing.plain',
      summary: 'Plain throw',
      error: 'just a string',
    })
    expect(details().stack).toBeUndefined()
  })

  it('tags the release with the first 12 characters of the commit, and omits it when unset', async () => {
    await logger.logSystemError({ severity: 'error', category: 'api', operation: 'rel.none', message: 'no release' })
    expect('release' in details()).toBe(false)

    resetDb()
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA)
    await logger.logSystemError({ severity: 'error', category: 'api', operation: 'rel.set', message: 'release' })
    expect(details().release).toBe(SHA.slice(0, 12))
  })

  it('records runtime client and a client release when the route passes them', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA)
    await logger.logSystemError({
      severity: 'warning',
      category: 'api',
      operation: 'client.x',
      message: 'client',
      runtime: 'client',
      release: 'fedcba9876543210',
      stack: 'Error: client\n    at a (https://prodily.app/_next/static/chunks/a.js:1:2)',
    })
    expect(details()).toMatchObject({ runtime: 'client', release: 'fedcba987654', app: 'web' })
    expect(details().stack).toContain('a.js:1:2')
  })
})

// ─── B. user_id ──────────────────────────────────────────────────────────────

describe('logger: user_id column', () => {
  it('sets user_id from the userId option', async () => {
    await logger.logErrorReport({
      domain: 'api',
      kind: 'unexpected',
      operation: 'user.op',
      summary: 'With a user',
      userId: LEARNER_ID,
    })
    expect(db.inserted[0].user_id).toBe(LEARNER_ID)
  })

  it('drops a userId that is not a uuid instead of failing the insert', async () => {
    await logger.logSystemError({ severity: 'error', category: 'api', operation: 'u.bad', message: 'x', userId: 'not-a-uuid' })
    expect(db.inserted[0].user_id).toBeNull()
  })

  it('writes the row without user_id when the foreign key refuses it', async () => {
    db.insertFailOnceWith = { code: '23503', message: 'violates foreign key constraint' }
    const id = await logger.logSystemError({ severity: 'error', category: 'api', operation: 'u.fk', message: 'x', userId: LEARNER_ID })
    expect(id).toBe('row-1')
    expect(db.inserted[0].user_id).toBeNull()
  })

  it('withRoute attributes an unexpected fault to the learner and keeps the stack', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue({ id: LEARNER_ID, email: 'l@example.com' })
    const route = withRoute({ actor: { allow: ['learner'] }, operation: 'thing.fail' }, async () => {
      throw new Error('handler exploded')
    })

    const res = await route(new Request('https://prodily.app/api/thing'))

    expect(res.status).toBe(500)
    expect(db.inserted).toHaveLength(1)
    expect(db.inserted[0].user_id).toBe(LEARNER_ID)
    expect(String(details().stack)).toContain('handler exploded')
  })
})

// ─── C. ignore list ──────────────────────────────────────────────────────────

describe('logger: ignored fingerprints', () => {
  const critical = { severity: 'critical' as const, category: 'system' as const, operation: 'ign.op', message: 'Disk on fire' }

  it('alerts for a critical incident that is not ignored', async () => {
    await logger.logSystemError(critical)
    expect(db.inserted).toHaveLength(1)
    expect(deliverOutOfBandAlert).toHaveBeenCalledTimes(1)
  })

  it('records an ignored fingerprint but never alerts', async () => {
    await logger.logSystemError(critical)
    const fingerprint = String(db.inserted[0].fingerprint)

    resetDb()
    deliverOutOfBandAlert.mockClear()
    logger.resetIgnoredFingerprintsCacheForTests()
    db.settings.set(logger.IGNORED_FINGERPRINTS_SETTING_KEY, ['other', fingerprint])

    await logger.logSystemError(critical)

    expect(db.inserted).toHaveLength(1)
    expect(deliverOutOfBandAlert).not.toHaveBeenCalled()
  })

  it('accepts the list stored as a JSON string and caches it for 60 seconds', async () => {
    await logger.logSystemError(critical)
    const fingerprint = String(db.inserted[0].fingerprint)
    resetDb()
    deliverOutOfBandAlert.mockClear()
    logger.resetIgnoredFingerprintsCacheForTests()
    db.settings.set(logger.IGNORED_FINGERPRINTS_SETTING_KEY, JSON.stringify([fingerprint]))

    await logger.logSystemError({ ...critical, operation: 'ign.a' })
    await logger.logSystemError(critical)

    expect(db.settingsReads).toBe(1)
    expect(deliverOutOfBandAlert).toHaveBeenCalledTimes(1) // ign.a only
  })

  it('fails open to an empty list when the settings read fails', async () => {
    db.settingsFail = true
    await logger.logSystemError(critical)
    expect(deliverOutOfBandAlert).toHaveBeenCalledTimes(1)
  })
})

// ─── D. regression ───────────────────────────────────────────────────────────

describe('logger: regression after resolve', () => {
  it('inserts a new row flagged as a regression instead of counting onto a resolved one', async () => {
    const report = { domain: 'api' as const, kind: 'unexpected' as const, operation: 'reg.op', summary: 'Came back' }
    await logger.logErrorReport(report)
    db.rows[0].status = 'resolved'

    await logger.logErrorReport(report)

    expect(db.inserted).toHaveLength(2)
    expect(db.updates).toHaveLength(0)
    expect(db.rows[0].occurrence_count).toBe(1)
    expect(db.inserted[1].status).toBe('new')
    expect(details(1).regression).toBe(true)
    expect(details(0).regression).toBeUndefined()
  })

  it('counts onto an acknowledged row inside the window as before', async () => {
    const report = { domain: 'api' as const, kind: 'unexpected' as const, operation: 'ack.op', summary: 'Still happening' }
    await logger.logErrorReport(report)
    db.rows[0].status = 'acknowledged'
    await logger.logErrorReport(report)
    expect(db.inserted).toHaveLength(1)
    expect(db.rows[0].occurrence_count).toBe(2)
  })
})

// ─── E. dedup window from updated_at ─────────────────────────────────────────

describe('logger: dedup window measured from last seen', () => {
  const report = { domain: 'api' as const, kind: 'unexpected' as const, operation: 'win.op', summary: 'Long outage' }

  it('keeps a continuous outage on one row although it started long ago', async () => {
    await logger.logErrorReport(report)
    const now = Date.now()
    db.rows[0].timestamp = new Date(now - 60 * 60 * 1000).toISOString()
    db.rows[0].updated_at = new Date(now - 5 * 60 * 1000).toISOString()

    await logger.logErrorReport(report)

    expect(db.inserted).toHaveLength(1)
    expect(db.rows[0].occurrence_count).toBe(2)
    expect(Date.parse(String(db.updates[0].updated_at))).toBeGreaterThanOrEqual(now)
  })

  it('starts a new row once the incident has not been seen for 15 minutes', async () => {
    await logger.logErrorReport(report)
    const stale = new Date(Date.now() - 16 * 60 * 1000).toISOString()
    db.rows[0].timestamp = stale
    db.rows[0].updated_at = stale

    await logger.logErrorReport(report)

    expect(db.inserted).toHaveLength(2)
    expect(db.rows[0].occurrence_count).toBe(1)
    expect(details(1).regression).toBeUndefined()
  })
})

// ─── instrumentation ─────────────────────────────────────────────────────────

describe('instrumentation onRequestError: stack and release', () => {
  it('stores the redacted stack and the release beside the existing fields', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', SHA)
    const error = errorWithStack(`render failed ${JWT}`, 40)

    await onRequestError(
      error,
      { path: '/dashboard?token_hash=abcdefgh', method: 'GET', headers: {} },
      {
        routerKind: 'App Router',
        routePath: '/app/(app)/dashboard/page',
        routeType: 'render',
        renderSource: 'react-server-components',
        revalidateReason: undefined,
      }
    )

    const d = details()
    expect(d).toMatchObject({ errorName: 'Error', path: '/dashboard', release: SHA.slice(0, 12), app: 'web', runtime: 'server' })
    expect(String(d.stack)).toContain('[REDACTED_JWT]')
    expect(String(d.stack).split('\n').filter((l) => /^\s*at\s/.test(l))).toHaveLength(30)
  })
})

// ─── Beacon ──────────────────────────────────────────────────────────────────

function stubBrowser() {
  const target = new EventTarget()
  const sendBeacon = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true)
  const win = Object.assign(target, {
    location: { pathname: '/dashboard', href: 'https://prodily.app/dashboard', origin: 'https://prodily.app' },
  })
  vi.stubGlobal('window', win)
  vi.stubGlobal('navigator', { sendBeacon })
  vi.stubGlobal('fetch', vi.fn())
  return { win, sendBeacon }
}

async function sentBodies(sendBeacon: { mock: { calls: unknown[][] } }): Promise<Array<Record<string, unknown>>> {
  return Promise.all(sendBeacon.mock.calls.map(async (call) => JSON.parse(await (call[1] as Blob).text())))
}

function errorEvent(init: { error?: unknown; message?: string; filename?: string }): Event {
  return Object.assign(new Event('error'), { error: init.error ?? null, message: init.message ?? '', filename: init.filename ?? '' })
}

function rejectionEvent(reason: unknown): Event {
  return Object.assign(new Event('unhandledrejection'), { reason })
}

describe('client beacon: new fields, cap and dedupe', () => {
  beforeEach(() => beacon.resetClientErrorBeaconForTests())
  afterEach(() => beacon.resetClientErrorBeaconForTests())

  it('sends source, app and a stack truncated to 4000 with URL queries stripped', async () => {
    const { sendBeacon } = stubBrowser()
    const error = new Error('boom')
    error.stack = `Error: boom\n    at x (https://prodily.app/reset-password?token_hash=abcdef123456:10:5)\n${'    at y (https://prodily.app/a.js:1:1)\n'.repeat(200)}`

    beacon.reportClientError(error, 'app')

    const [body] = await sentBodies(sendBeacon)
    expect(body).toMatchObject({ message: 'boom', boundary: 'app', source: 'boundary', app: 'web' })
    expect(String(body.stack).length).toBe(beacon.MAX_CLIENT_ERROR_STACK_LENGTH)
    expect(body.stack).toContain('https://prodily.app/reset-password:10:5')
    expect(body.stack).not.toContain('abcdef123456')
  })

  it('reads the release from NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA at build time', async () => {
    vi.stubEnv('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA', SHA)
    vi.resetModules()
    const fresh = await import('@/lib/monitoring/client-error-beacon')
    const payload = fresh.buildClientErrorPayload(new Error('x'), 'root', '/')
    expect(payload.release).toBe(SHA)

    vi.stubEnv('NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA', '')
    vi.resetModules()
    const unset = await import('@/lib/monitoring/client-error-beacon')
    expect('release' in unset.buildClientErrorPayload(new Error('x'), 'root', '/')).toBe(false)
  })

  it('sends at most 5 reports per page and one per distinct error, across all sources', async () => {
    const { win, sendBeacon } = stubBrowser()
    beacon.installGlobalErrorListeners()

    const same = new Error('same')
    beacon.reportClientError(same, 'app')
    win.dispatchEvent(errorEvent({ error: same, message: 'same', filename: 'https://prodily.app/a.js' }))
    for (let i = 0; i < 10; i++) win.dispatchEvent(rejectionEvent(new Error(`rejected ${i}`)))

    expect(sendBeacon).toHaveBeenCalledTimes(beacon.MAX_REPORTS_PER_PAGE)
    const bodies = await sentBodies(sendBeacon)
    expect(bodies.filter((b) => b.message === 'same')).toHaveLength(1)
    expect(bodies[1]).toMatchObject({ source: 'unhandledrejection', app: 'web' })
    expect(bodies[1].boundary).toBeUndefined()
  })

  it('reports a window error with source window.onerror', async () => {
    const { win, sendBeacon } = stubBrowser()
    beacon.installGlobalErrorListeners()

    win.dispatchEvent(errorEvent({ error: new Error('click handler'), message: 'click handler', filename: 'https://prodily.app/_next/a.js' }))

    const [body] = await sentBodies(sendBeacon)
    expect(body).toMatchObject({ message: 'click handler', source: 'window.onerror', app: 'web' })
  })

  it.each([
    ['a ResizeObserver loop error', { message: 'ResizeObserver loop completed with undelivered notifications.' }],
    ['a cross-origin Script error. with no stack', { message: 'Script error.' }],
    ['an error from a browser extension script', { message: 'ext', error: new Error('ext'), filename: 'chrome-extension://abc/content.js' }],
    ['an error from a foreign origin', { message: 'cdn', error: new Error('cdn'), filename: 'https://evil.example/x.js' }],
  ])('ignores %s', (_label, init) => {
    const { win, sendBeacon } = stubBrowser()
    beacon.installGlobalErrorListeners()
    win.dispatchEvent(errorEvent(init))
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('ignores a rejection whose stack points into an extension', () => {
    const { win, sendBeacon } = stubBrowser()
    beacon.installGlobalErrorListeners()
    const reason = new Error('ext')
    reason.stack = 'Error: ext\n    at f (moz-extension://abc/inject.js:1:1)'
    win.dispatchEvent(rejectionEvent(reason))
    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('installs the listeners once however often it is called', () => {
    const { win, sendBeacon } = stubBrowser()
    const add = vi.spyOn(win, 'addEventListener')

    beacon.installGlobalErrorListeners()
    beacon.installGlobalErrorListeners()
    beacon.installGlobalErrorListeners()

    expect(add.mock.calls.map((c) => c[0])).toEqual(['error', 'unhandledrejection'])
    win.dispatchEvent(rejectionEvent(new Error('once')))
    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })

  it('is mounted from ApiClientProvider, which the root layout renders', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const root = path.resolve(__dirname, '../..')
    const hooks = fs.readFileSync(path.join(root, 'lib/api/hooks.ts'), 'utf-8')
    const layout = fs.readFileSync(path.join(root, 'app/layout.tsx'), 'utf-8')
    expect(hooks).toMatch(/useEffect\(\(\) => \{\s*installGlobalErrorListeners\(\)\s*\}, \[\]\)/)
    expect(layout).toContain('<ApiClientProvider>')
  })
})

describe('error boundaries report with source boundary', () => {
  it.each([
    ['app/error.tsx', 'root'],
    ['app/(app)/error.tsx', 'app'],
    ['app/global-error.tsx', 'global'],
  ])('%s reports through the beacon', async (file, boundary) => {
    const fs = await import('fs')
    const path = await import('path')
    const src = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf-8')
    expect(src).toContain(`reportClientError(error, '${boundary}')`)
  })
})

// ─── Route ───────────────────────────────────────────────────────────────────

function report(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/client-errors', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.9', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const VALID = {
  message: 'Cannot read properties of undefined',
  path: '/dashboard',
  boundary: 'app',
  source: 'boundary',
  app: 'web',
  stack: 'TypeError: x\n    at a (https://prodily.app/_next/static/chunks/a.js?v=1:1:2)',
  release: SHA,
}

describe('POST /api/client-errors: contract fields and global cap', () => {
  it('stores source, app, runtime, release and stack in details', async () => {
    const res = await POST(report(VALID))

    expect(res.status).toBe(204)
    expect(db.inserted).toHaveLength(1)
    expect(db.inserted[0].operation).toBe('client.error_boundary')
    expect(db.inserted[0].user_id).toBeNull()
    expect(details()).toMatchObject({
      boundary: 'app',
      source: 'boundary',
      app: 'web',
      runtime: 'client',
      release: SHA.slice(0, 12),
      path: '/dashboard',
    })
    expect(details().stack).toContain('chunks/a.js:1:2')
    expect(details().stack).not.toContain('?v=1')
  })

  it('accepts a listener report without a boundary', async () => {
    const res = await POST(report({ message: 'late', path: '/x', source: 'unhandledrejection', app: 'web' }))
    expect(res.status).toBe(204)
    expect(db.inserted[0].operation).toBe('client.unhandled_rejection')
    expect(details().source).toBe('unhandledrejection')
  })

  it('still accepts an old-shape boundary report with no source', async () => {
    const res = await POST(report({ message: 'old', path: '/x', boundary: 'root' }))
    expect(res.status).toBe(204)
    expect(details().source).toBe('boundary')
  })

  it.each([
    ['a stack over 4000 characters', { ...VALID, stack: 'x'.repeat(beacon.MAX_CLIENT_ERROR_STACK_LENGTH + 1) }],
    ['a release over 40 characters', { ...VALID, release: 'a'.repeat(41) }],
    ['a release with unsafe characters', { ...VALID, release: 'abc def' }],
    ['an unknown source', { ...VALID, source: 'console' }],
    ['another app', { ...VALID, app: 'admin' }],
    ['a boundary report with no boundary', { message: 'x', path: '/x', source: 'boundary' }],
    ['a client-sent user id', { ...VALID, userId: LEARNER_ID }],
  ])('rejects %s with 400', async (_label, body) => {
    const res = await POST(report(body))
    expect(res.status).toBe(400)
    expect(db.inserted).toHaveLength(0)
  })

  it('accepts a full-size report under the raised body cap', async () => {
    const body = JSON.stringify({
      ...VALID,
      message: 'm'.repeat(beacon.MAX_CLIENT_ERROR_MESSAGE_LENGTH),
      stack: 's'.repeat(beacon.MAX_CLIENT_ERROR_STACK_LENGTH),
    })
    expect(body.length).toBeLessThan(beacon.MAX_CLIENT_ERROR_BODY_BYTES)
    const res = await POST(report(body))
    expect(res.status).toBe(204)
  })

  it('returns 429 once the global cap across all IPs is spent, without recording', async () => {
    evaluatePersistentRateLimit.mockImplementation(async (key: string) =>
      key === 'client_errors:global'
        ? { success: false, remaining: 0, resetInMs: 120_000 }
        : { success: true, remaining: 9, resetInMs: 60_000 }
    )

    const res = await POST(report(VALID))

    expect(res.status).toBe(429)
    expect((await res.json()).code).toBe('RATE_LIMITED')
    expect(db.inserted).toHaveLength(0)
    const globalCall = evaluatePersistentRateLimit.mock.calls.find((c) => c[0] === 'client_errors:global')
    expect(globalCall?.[1]).toMatchObject({ limit: 300, windowMs: 10 * 60 * 1000 })
  })

  it('does not charge the global cap when the per-IP limit already refused', async () => {
    evaluatePersistentRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 30_000 })
    const res = await POST(report(VALID))
    expect(res.status).toBe(429)
    expect(evaluatePersistentRateLimit.mock.calls.map((c) => c[0])).toEqual(['client_errors:203.0.113.9'])
  })
})
