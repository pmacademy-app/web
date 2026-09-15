/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B9-C — structured logging on the highest-value paths.
 *
 * `F-SEC-14`: raw `console.*` sends exception text straight to the platform log,
 * where redaction never runs. `system_errors` was redacted; the log stream beside
 * it was not — so a Postgres error carrying connection details, a provider body
 * carrying whatever the provider echoed, and an auth failure carrying token
 * material all landed unredacted.
 *
 * Two things are proved here: that the new logger cannot emit a secret or forge a
 * log record, and that the ten files the roadmap scopes actually went through it —
 * no more, no less.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { buildLogRecord, describeError, log } from '@/lib/monitoring/log'
import { runWithRequestContext } from '@/lib/monitoring/request-context'

const ROOT = path.resolve(import.meta.dirname, '../../')

const NEWLINE = String.fromCharCode(10)
const CARRIAGE_RETURN = String.fromCharCode(13)
const ESCAPE = String.fromCharCode(27)
const NUL = String.fromCharCode(0)

// ─── Record shape ────────────────────────────────────────────────────────────

describe('B9-C — the structured record', () => {
  it('carries a timestamp, level and stable event name', () => {
    const record = buildLogRecord('warn', 'queue.claim_rpc_unavailable')

    expect(record.level).toBe('warn')
    expect(record.event).toBe('queue.claim_rpc_unavailable')
    expect(Date.parse(record.ts)).not.toBeNaN()
  })

  it('keeps volatile values as fields rather than interpolating them', () => {
    const record = buildLogRecord('info', 'queue.stale_items_reclaimed', { reclaimedCount: 7 })

    expect(record.reclaimedCount).toBe(7)
    // The count must not be baked into the name, or dedup and search break.
    expect(record.event).toBe('queue.stale_items_reclaimed')
  })

  it('preserves booleans, numbers and null rather than stringifying them', () => {
    const record = buildLogRecord('warn', 'e', { gated: false, count: 0, emailId: null })

    expect(record.gated).toBe(false)
    expect(record.count).toBe(0)
    expect(record.emailId).toBeNull()
  })
})

// ─── Secret redaction ────────────────────────────────────────────────────────

describe('B9-C — secrets never reach the log', () => {
  const SECRETS: Array<[string, Record<string, unknown>, string]> = [
    ['an access token by key name', { access_token: 'ey.super.secret' }, 'ey.super.secret'],
    ['a refresh token by key name', { refresh_token: 'rt-secret-value' }, 'rt-secret-value'],
    ['a cookie header', { cookie: 'sb-access-token=abc123secret' }, 'abc123secret'],
    ['an authorization header', { authorization: 'Bearer tok-secret-1' }, 'tok-secret-1'],
    ['an api key', { api_key: 'sk_live_notreal_0000' }, 'sk_live_notreal_0000'],
    ['a password', { password: 'hunter2-secret' }, 'hunter2-secret'],
    ['a token hash', { token_hash: 'th-secret-value' }, 'th-secret-value'],
    ['a service role key', { service_role_key: 'srk-secret-value' }, 'srk-secret-value'],
  ]

  for (const [why, fields, secret] of SECRETS) {
    it(`redacts ${why}`, () => {
      const emitted = JSON.stringify(buildLogRecord('error', 'e', fields))

      expect(emitted).not.toContain(secret)
      expect(emitted).toContain('[REDACTED]')
    })
  }

  it('redacts a connection string hidden inside an exception message', () => {
    const cause = new Error('connect failed for postgresql://user:hunter2@db.internal:5432/app')
    const emitted = JSON.stringify(buildLogRecord('error', 'e', { err: describeError(cause) }))

    expect(emitted).not.toContain('hunter2')
  })

  it('masks an email address rather than printing it whole', () => {
    const emitted = JSON.stringify(buildLogRecord('warn', 'e', { note: 'sent to alice@example.com' }))

    expect(emitted).not.toContain('alice@example.com')
    expect(emitted).toContain('example.com')
  })

  it('bounds a hostile oversized value instead of logging all of it', () => {
    const record = buildLogRecord('warn', 'e', { blob: 'a'.repeat(10_000) })

    expect(String(record.blob).length).toBeLessThan(3000)
  })

  it('survives a circular payload', () => {
    const circular: Record<string, unknown> = { name: 'x' }
    circular.self = circular

    expect(() => buildLogRecord('warn', 'e', circular)).not.toThrow()
  })
})

// ─── Log injection ───────────────────────────────────────────────────────────

describe('B9-C — an attacker-controlled string cannot forge log structure', () => {
  it('strips newlines from a field value', () => {
    const record = buildLogRecord('warn', 'auth.hook.unknown_action_type', {
      actionType: `signup${NEWLINE}level=error event=admin.granted`,
    })

    expect(String(record.actionType)).not.toContain(NEWLINE)
  })

  it('strips carriage returns, escapes and NUL', () => {
    const record = buildLogRecord('warn', 'e', {
      v: `a${CARRIAGE_RETURN}b${ESCAPE}[31mc${NUL}d`,
    })

    for (const control of [CARRIAGE_RETURN, ESCAPE, NUL]) {
      expect(String(record.v)).not.toContain(control)
    }
  })

  it('strips control characters from the event name itself', () => {
    const record = buildLogRecord('warn', `evt${NEWLINE}injected`)

    expect(record.event).not.toContain(NEWLINE)
  })

  it('strips control characters from field keys', () => {
    const record = buildLogRecord('warn', 'e', { [`k${NEWLINE}x`]: 'v' })

    expect(Object.keys(record).every((k) => !k.includes(NEWLINE))).toBe(true)
  })
})

// ─── Correlation id ──────────────────────────────────────────────────────────

describe('B9-C — correlation id propagation reuses B9-B', () => {
  it('picks up the ambient request id with no parameter threading', () => {
    const record = runWithRequestContext({ requestId: 'req_abc123' }, () =>
      buildLogRecord('warn', 'queue.claim_rpc_unavailable')
    )

    expect(record.requestId).toBe('req_abc123')
  })

  it('propagates across an await boundary', async () => {
    const record = await runWithRequestContext({ requestId: 'req_deep' }, async () => {
      await Promise.resolve()
      return buildLogRecord('info', 'queue.stale_items_reclaimed')
    })

    expect(record.requestId).toBe('req_deep')
  })

  it('lets an explicit id win over the ambient one', () => {
    const record = runWithRequestContext({ requestId: 'req_ambient' }, () =>
      buildLogRecord('warn', 'e', { requestId: 'req_explicit' })
    )

    expect(record.requestId).toBe('req_explicit')
  })

  it('omits the field entirely outside a request', () => {
    const record = buildLogRecord('warn', 'e')

    expect(record.requestId).toBeUndefined()
    expect('requestId' in record).toBe(false)
  })

  it('does not mint a competing id when none exists', () => {
    // B9-B owns request identity. A log outside a request has no id rather than a
    // freshly-invented one, which would look like a request that never happened.
    const emitted = JSON.stringify(buildLogRecord('warn', 'e'))

    expect(emitted).not.toContain('req_')
  })
})

// ─── withRoute publishes the context ─────────────────────────────────────────

describe('B9-C — withRoute publishes the B9-B id as ambient context', () => {
  it('wires the wrapper to runWithRequestContext with the resolved id', () => {
    const source = readFileSync(path.join(ROOT, 'lib/api/with-route.ts'), 'utf8')

    expect(source).toContain('runWithRequestContext({ requestId }')
    // The id still comes from B9-B's resolver, not a second mechanism.
    expect(source).toContain('resolveRequestId(request)')
  })

  it('keeps the async-hooks store out of the middleware bundle', () => {
    // `proxy.ts` runs as Next.js middleware on the Edge runtime, where
    // `node:async_hooks` does not exist. Importing the store there would break the
    // build, so the store is a separate module from `request-id.ts`.
    const proxySource = readFileSync(path.join(ROOT, 'proxy.ts'), 'utf8')
    const requestIdSource = readFileSync(path.join(ROOT, 'lib/monitoring/request-id.ts'), 'utf8')

    expect(proxySource).not.toContain('request-context')
    expect(proxySource).not.toContain('async_hooks')
    expect(requestIdSource).not.toContain('async_hooks')
  })
})

// ─── Severity and environment behaviour ──────────────────────────────────────

describe('B9-C — severity and environment', () => {
  const spies: Record<string, any> = {}

  beforeEach(() => {
    for (const level of ['debug', 'info', 'warn', 'error'] as const) {
      spies[level] = vi.spyOn(console, level).mockImplementation(() => {})
    }
    vi.stubEnv('PRODILY_LOG_IN_TESTS', 'true')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('routes each level to the matching console method', () => {
    log.info('e.info')
    log.warn('e.warn')
    log.error('e.error')

    expect(spies.info).toHaveBeenCalledTimes(1)
    expect(spies.warn).toHaveBeenCalledTimes(1)
    expect(spies.error).toHaveBeenCalledTimes(1)
  })

  it('emits one JSON line in production', () => {
    vi.stubEnv('NODE_ENV', 'production')

    log.warn('queue.claim_rpc_unavailable', { fallback: 'sequential_claim' })

    const [line] = spies.warn.mock.calls[0]
    const parsed = JSON.parse(line)
    expect(parsed.event).toBe('queue.claim_rpc_unavailable')
    expect(parsed.fallback).toBe('sequential_claim')
    expect(String(line)).not.toContain(NEWLINE)
  })

  it('drops debug in production but keeps it in development', () => {
    vi.stubEnv('NODE_ENV', 'production')
    log.debug('e.debug')
    expect(spies.debug).not.toHaveBeenCalled()

    vi.stubEnv('NODE_ENV', 'development')
    log.debug('e.debug')
    expect(spies.debug).toHaveBeenCalledTimes(1)
  })

  it('is silent under test unless explicitly enabled', () => {
    vi.stubEnv('PRODILY_LOG_IN_TESTS', '')

    log.error('e.error')

    // Converting 39 call sites must not start printing into 147 suites, and an
    // assertion about output has to opt in rather than fight the default.
    expect(spies.error).not.toHaveBeenCalled()
  })
})

// ─── Relationship to persisted incidents ─────────────────────────────────────

describe('B9-C — ordinary logs are not incidents', () => {
  it('writes nothing to system_errors and raises no alert', () => {
    // Comments stripped: the module's own docs explain what it deliberately is
    // NOT, so a plain substring match would flag the explanation as the offence.
    const source = readFileSync(path.join(ROOT, 'lib/monitoring/log.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')

    // `logErrorReport` derives severity, fingerprints, persists and can page an
    // admin. A degraded-but-handled path must not do any of that, or one RPC
    // fallback becomes an alert storm.
    expect(source).not.toContain('logErrorReport')
    expect(source).not.toContain('persistIncident')
    expect(source).not.toContain('createServiceRoleClient')
    expect(source).not.toContain('fingerprint')
  })

  it('leaves the existing incident path in place where it was already correct', () => {
    // The hook and the queue keep their `logSystemError` / `logErrorReport` calls;
    // B9-C converted the console lines beside them, not the incident reporting.
    const hook = readFileSync(path.join(ROOT, 'app/api/auth/send-email-hook/route.ts'), 'utf8')
    const processor = readFileSync(path.join(ROOT, 'lib/notifications/queue/processor.ts'), 'utf8')

    expect(hook).toContain('logSystemError')
    expect(processor).toContain('logErrorReport')
  })
})

// ─── Scope: exactly the roadmap's file list ──────────────────────────────────

const CONVERTED = [
  'lib/notifications/queue/processor.ts',
  'app/api/auth/callback/route.ts',
  'app/api/auth/login/route.ts',
  'app/api/auth/refresh/route.ts',
  'app/api/auth/send-email-hook/route.ts',
  'app/api/auth/session/route.ts',
  'app/api/auth/signup/route.ts',
  'app/api/auth/telemetry/route.ts',
  'app/api/email/unsubscribe/route.ts',
  'app/api/email/webhooks/route.ts',
]

describe('B9-C — scope', () => {
  it('leaves no raw console.* in the three named paths', () => {
    for (const dir of ['lib/notifications/queue', 'app/api/auth', 'app/api/email']) {
      const walk = (d: string) => {
        for (const entry of readdirSync(path.join(ROOT, d))) {
          const rel = `${d}/${entry}`
          if (statSync(path.join(ROOT, rel)).isDirectory()) walk(rel)
          else if (entry.endsWith('.ts')) {
            expect(readFileSync(path.join(ROOT, rel), 'utf8'), rel).not.toMatch(/\bconsole\.(log|warn|error|info|debug)\(/)
          }
        }
      }
      walk(dir)
    }
  })

  it('routes every converted file through the structured logger', () => {
    for (const file of CONVERTED) {
      // Exact import path: `@/lib/monitoring/logger` is a different module and a
      // substring of this one.
      expect(readFileSync(path.join(ROOT, file), 'utf8'), file).toContain(
        "from '@/lib/monitoring/log'"
      )
    }
  })

  it('did not exceed the scoped file list', () => {
    // The roadmap is explicit that the other ~295 call sites are out of scope:
    // converting them all is churn for little gain. This pins that the batch stayed
    // where it was told to, by checking a representative untouched area.
    const untouched = ['lib/admin/service.ts', 'lib/portfolio-db.ts', 'lib/leaderboard-db.ts']

    for (const file of untouched) {
      expect(readFileSync(path.join(ROOT, file), 'utf8'), file).not.toContain(
        "from '@/lib/monitoring/log'"
      )
    }
  })
})
