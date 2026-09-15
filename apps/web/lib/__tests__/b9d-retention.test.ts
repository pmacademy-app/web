/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * B9-D — the retention policy.
 *
 * `F-REL-6`: `/api/cron/cleanup` was an honest no-op while six tables grew
 * forever. This batch makes it sweep — and the interesting part is not that it
 * deletes, it is everything that stops it deleting the wrong thing.
 *
 * So the assertions here are mostly about restraint: the windows come from L-11
 * rather than from anyone's judgement, held records survive at any age, dry-run is
 * the default and removes nothing, `admin_audit_logs` is untouchable, and a real
 * setting can never be mistaken for a dated counter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  RETENTION_RULES,
  SECURITY_CATEGORIES,
  cutoffFor,
  isExpiredDailyCounterKey,
} from '@/lib/retention/policy'
import { DELETE_BATCH_SIZE, runRetentionSweep, sweepRule } from '@/lib/retention/sweep'

const ROOT = path.resolve(import.meta.dirname, '../../')
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-15T12:00:00.000Z')

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: vi.fn(),
  logSystemError: vi.fn(),
}))

// ─── The policy is L-11's, not ours ──────────────────────────────────────────

describe('B9-D — the windows come from L-11', () => {
  const EXPECTED: Record<string, number> = {
    'email_queue.completed': 30,
    'email_queue.dead_letter': 90,
    email_delivery_events: 90,
    'system_errors.operational': 90,
    'system_errors.security': 180,
    notification_events: 30,
    user_notification_timeline: 30,
    rate_limits: 30,
  }

  for (const [id, days] of Object.entries(EXPECTED)) {
    it(`${id} retains for ${days} days`, () => {
      const rule = RETENTION_RULES.find((r) => r.id === id)
      expect(rule, id).toBeDefined()
      expect(rule!.days).toBe(days)
    })
  }

  it('states the policy line each window comes from', () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.reason, rule.id).toMatch(/^L-11:/)
    }
  })

  it('keeps security and abuse incidents twice as long as operational ones', () => {
    const operational = RETENTION_RULES.find((r) => r.id === 'system_errors.operational')!
    const security = RETENTION_RULES.find((r) => r.id === 'system_errors.security')!

    expect(security.days).toBe(180)
    expect(operational.days).toBe(90)
    // The two must partition the table, or a row is either swept twice or never.
    expect(security.categoryIn).toEqual([...SECURITY_CATEGORIES])
    expect(operational.categoryNotIn).toEqual([...SECURITY_CATEGORIES])
  })
})

describe('B9-D — what is never swept', () => {
  it('does not touch admin_audit_logs at any age', () => {
    // B9-D's scope note is explicit: a security review needs it. Its absence from
    // the rule list is the mechanism, so this pins the absence.
    expect(RETENTION_RULES.some((r) => r.table === 'admin_audit_logs')).toBe(false)

    const policy = readFileSync(path.join(ROOT, 'lib/retention/policy.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')
    expect(policy).not.toContain('admin_audit_logs')
  })

  it('does not sweep users, xp_events or any learner content table', () => {
    const swept = new Set(RETENTION_RULES.map((r) => r.table))

    for (const table of ['users', 'xp_events', 'capstone_submissions', 'reflections', 'certificates']) {
      expect(swept.has(table), table).toBe(false)
    }
  })
})

// ─── Dated counters versus real settings ─────────────────────────────────────

describe('B9-D — a real setting can never be mistaken for a dated counter', () => {
  it('matches only the exact dated-counter shape', () => {
    expect(isExpiredDailyCounterKey('email_sent_count_2026_01_01', NOW)).toBe(true)
  })

  it('ignores live configuration keys', () => {
    for (const key of [
      'email_automations',
      'feature_flags',
      'email_daily_send_limit',
      'email_global_pause',
      'onboarding',
      'cron_heartbeat:process-email-queue',
      'email_sent_count',
      'email_sent_count_totals',
      'email_sent_count_2026_13',
    ]) {
      expect(isExpiredDailyCounterKey(key, NOW), key).toBe(false)
    }
  })

  it('keeps a counter inside the window', () => {
    const recent = new Date(NOW.getTime() - 5 * DAY)
    const key = `email_sent_count_${recent.toISOString().slice(0, 10).replace(/-/g, '_')}`

    expect(isExpiredDailyCounterKey(key, NOW)).toBe(false)
  })

  it('treats the boundary day as still retained', () => {
    // A counter labelled with the day 30 days ago still describes activity inside
    // the window, because its day did not end until the following midnight.
    const atBoundary = new Date(NOW.getTime() - 30 * DAY)
    const key = `email_sent_count_${atBoundary.toISOString().slice(0, 10).replace(/-/g, '_')}`

    expect(isExpiredDailyCounterKey(key, NOW)).toBe(false)
  })

  it('sweeps a counter once its whole day is outside the window', () => {
    const wellOutside = new Date(NOW.getTime() - 32 * DAY)
    const key = `email_sent_count_${wellOutside.toISOString().slice(0, 10).replace(/-/g, '_')}`

    expect(isExpiredDailyCounterKey(key, NOW)).toBe(true)
  })
})

// ─── Cutoff boundaries ───────────────────────────────────────────────────────

describe('B9-D — boundary dates', () => {
  it('computes the cutoff as exactly N days back', () => {
    expect(cutoffFor(30, NOW).toISOString()).toBe(new Date(NOW.getTime() - 30 * DAY).toISOString())
  })
})

// ─── The sweep ───────────────────────────────────────────────────────────────

/**
 * A fake that records the filters each query applied, so eligibility can be
 * asserted without a database.
 */
function createDb(rowsByTable: Record<string, any[]>) {
  const calls: Array<{ table: string; op: string; filters: Record<string, unknown> }> = []
  const deleted: Record<string, unknown[]> = {}

  const makeChain = (table: string, op: string) => {
    const filters: Record<string, unknown> = {}
    calls.push({ table, op, filters })

    const chain: any = {
      lt: (c: string, v: string) => { filters[`lt:${c}`] = v; return chain },
      eq: (c: string, v: unknown) => { filters[`eq:${c}`] = v; return chain },
      in: (c: string, v: readonly unknown[]) => {
        filters[`in:${c}`] = v
        if (op === 'delete') {
          deleted[table] = [...(deleted[table] ?? []), ...v]
          // Actually remove them, so the sweep's loop terminates the way it does
          // against a real table and a second pass genuinely finds nothing.
          const gone = new Set(v)
          rowsByTable[table] = (rowsByTable[table] ?? []).filter(
            (row: any) => !gone.has(row[c])
          )
          return Promise.resolve({ error: null })
        }
        return chain
      },
      not: (c: string, o: string, v: unknown) => { filters[`not:${c}`] = v; return chain },
      like: (c: string, v: string) => { filters[`like:${c}`] = v; return chain },
      limit: (n: number) => Promise.resolve({ data: (rowsByTable[table] ?? []).slice(0, n), error: null }),
      then: (resolve: any) => resolve({ data: rowsByTable[table] ?? [], error: null }),
    }
    return chain
  }

  const db: any = {
    from: (table: string) => ({
      select: () => makeChain(table, 'select'),
      delete: () => makeChain(table, 'delete'),
    }),
  }

  return { db, calls, deleted }
}

const QUEUE_RULE = RETENTION_RULES.find((r) => r.id === 'email_queue.completed')!

describe('B9-D — dry run', () => {
  it('reports eligible rows and deletes nothing', async () => {
    const { db, deleted } = createDb({ email_queue: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] })

    const outcome = await sweepRule(db, QUEUE_RULE, { dryRun: true, now: NOW })

    expect(outcome.eligible).toBe(3)
    expect(outcome.deleted).toBe(0)
    expect(deleted.email_queue).toBeUndefined()
  })

  it('issues no delete statement at all', async () => {
    const { db, calls } = createDb({ email_queue: [{ id: 'a' }] })

    await sweepRule(db, QUEUE_RULE, { dryRun: true, now: NOW })

    expect(calls.some((c) => c.op === 'delete')).toBe(false)
  })
})

describe('B9-D — eligibility filters', () => {
  it('bounds the sweep by the rule window', async () => {
    const { db, calls } = createDb({ email_queue: [{ id: 'a' }] })

    await sweepRule(db, QUEUE_RULE, { dryRun: true, now: NOW })

    const select = calls.find((c) => c.op === 'select')!
    expect(select.filters['lt:updated_at']).toBe(new Date(NOW.getTime() - 30 * DAY).toISOString())
  })

  it('excludes held records on every table that supports a hold', async () => {
    for (const rule of RETENTION_RULES.filter((r) => r.supportsHold)) {
      const { db, calls } = createDb({ [rule.table]: [{ [rule.idColumn]: 'x' }] })

      await sweepRule(db, rule, { dryRun: true, now: NOW })

      const select = calls.find((c) => c.op === 'select')!
      // L-11: "Active legal/incident holds override automatic deletion."
      expect(select.filters['eq:retention_hold'], rule.id).toBe(false)
    }
  })

  it('does not filter on a hold column where none exists', async () => {
    const rule = RETENTION_RULES.find((r) => r.id === 'rate_limits')!
    const { db, calls } = createDb({ rate_limits: [{ key: 'k' }] })

    await sweepRule(db, rule, { dryRun: true, now: NOW })

    expect(calls.find((c) => c.op === 'select')!.filters['eq:retention_hold']).toBeUndefined()
  })

  it('restricts the completed-queue sweep to terminal successful statuses', async () => {
    const { db, calls } = createDb({ email_queue: [{ id: 'a' }] })

    await sweepRule(db, QUEUE_RULE, { dryRun: true, now: NOW })

    const statuses = calls.find((c) => c.op === 'select')!.filters['in:status'] as string[]
    expect(statuses).toContain('sent')
    expect(statuses).toContain('delivered')
    // A pending or retrying row is still live work and must never be swept.
    expect(statuses).not.toContain('pending')
    expect(statuses).not.toContain('retrying')
    expect(statuses).not.toContain('processing')
  })
})

describe('B9-D — live deletion, batching and idempotency', () => {
  it('deletes by id in bounded batches rather than one open statement', async () => {
    const rows = Array.from({ length: DELETE_BATCH_SIZE }, (_, i) => ({ id: `q-${i}` }))
    const { db, deleted, calls } = createDb({ email_queue: rows })

    const outcome = await sweepRule(db, QUEUE_RULE, { dryRun: false, now: NOW })

    expect(outcome.deleted).toBe(DELETE_BATCH_SIZE)
    expect(deleted.email_queue).toHaveLength(DELETE_BATCH_SIZE)
    // One full page, then a short page that ends the loop.
    expect(calls.filter((c) => c.op === 'delete')).toHaveLength(1)
    // Every delete names explicit ids — never a bare `WHERE timestamp < x`.
    expect(calls.filter((c) => c.op === 'delete').every((c) => 'in:id' in c.filters)).toBe(true)
  })

  it('is a no-op on a second run once the rows are gone', async () => {
    const { db } = createDb({ email_queue: [] })

    const outcome = await sweepRule(db, QUEUE_RULE, { dryRun: false, now: NOW })

    expect(outcome.eligible).toBe(0)
    expect(outcome.deleted).toBe(0)
  })

  it('stops the run when the time budget is exhausted', async () => {
    const rows = Array.from({ length: DELETE_BATCH_SIZE }, (_, i) => ({ id: `q-${i}` }))
    const { db } = createDb({ email_queue: rows })

    const outcome = await sweepRule(db, QUEUE_RULE, {
      dryRun: false,
      now: NOW,
      deadline: Date.now() - 1,
    })

    expect(outcome.truncated).toBe(true)
    expect(outcome.deleted).toBe(0)
  })
})

describe('B9-D — partial failure is contained', () => {
  it('reports a failing rule without stopping the others', async () => {
    const { db } = createDb({})
    const failing: any = {
      from: (table: string) => {
        if (table === 'email_queue') {
          return { select: () => ({ lt: () => { throw new Error('table unreachable') } }) }
        }
        return db.from(table)
      },
    }

    const result = await runRetentionSweep(failing, { dryRun: true, now: NOW })

    const failed = result.rules.filter((r) => r.error)
    expect(failed.length).toBeGreaterThan(0)
    // Every rule still produced an outcome — one bad table does not abort the sweep.
    expect(result.rules).toHaveLength(RETENTION_RULES.length + 1)
  })

  it('never throws out of the sweep', async () => {
    const exploding: any = { from: () => { throw new Error('boom') } }

    await expect(runRetentionSweep(exploding, { dryRun: true, now: NOW })).resolves.toBeDefined()
  })
})

// ─── The migration is not applied yet ────────────────────────────────────────

/**
 * B9-D names B14-A (the migration deploy guard) as a dependency, and B14-A has
 * not run. So the state that matters is: what happens if someone enables deletion
 * while `retention_hold` does not exist in the database?
 *
 * It must fail closed. These pin that it does, because the answer is the whole
 * reason the batch is safe to leave deferred.
 */
function dbMissingHoldColumn() {
  const deleted: string[] = []
  // Once a query touches `retention_hold` the error survives every subsequent
  // chained filter, the way PostgREST's does.
  const make = (op: string, poisoned: boolean): any => ({
    lt: () => make(op, poisoned),
    eq: (col: string) => make(op, poisoned || col === 'retention_hold'),
    not: () => make(op, poisoned),
    like: () => make(op, poisoned),
    order: () => make(op, poisoned),
    in: (_c: string, v: readonly unknown[]) => {
      if (op === 'delete') {
        deleted.push(...(v as string[]))
        return Promise.resolve({ error: null })
      }
      return make(op, poisoned)
    },
    limit: () =>
      Promise.resolve(
        poisoned
          ? { data: null, error: { message: 'column "retention_hold" does not exist' } }
          : { data: [{ id: 'row-1', key: 'email_sent_count_2026_01_01' }], error: null }
      ),
  })

  return {
    db: {
      from: () => ({ select: () => make('select', false), delete: () => make('delete', false) }),
    } as any,
    deleted,
  }
}

describe('B9-D — an unapplied migration fails closed rather than deleting', () => {
  it('deletes nothing from a hold-bearing table, even with deletion enabled', async () => {
    const { db, deleted } = dbMissingHoldColumn()
    const rule = RETENTION_RULES.find((r) => r.supportsHold)!

    const outcome = await sweepRule(db, rule, { dryRun: false, now: NOW })

    // The select errors before any id is collected, so the delete never runs.
    expect(outcome.deleted).toBe(0)
    expect(outcome.error).toContain('retention_hold')
    expect(deleted).toEqual([])
  })

  it('fails every hold-bearing rule rather than silently skipping the hold check', async () => {
    const { db } = dbMissingHoldColumn()

    const result = await runRetentionSweep(db, { dryRun: false, now: NOW })
    const failed = result.rules.filter((r) => r.error).map((r) => r.id)

    for (const rule of RETENTION_RULES.filter((r) => r.supportsHold)) {
      expect(failed, rule.id).toContain(rule.id)
    }
  })

  it('only sweeps the two rules that have no hold semantics by design', async () => {
    const { db } = dbMissingHoldColumn()

    const result = await runRetentionSweep(db, { dryRun: false, now: NOW })
    const swept = result.rules.filter((r) => r.deleted > 0).map((r) => r.id).sort()

    // A rate-limit bucket and a dated daily counter are never subject to a legal
    // hold, which is why neither has a hold column. Both are expired operational
    // telemetry, so sweeping them without the migration loses nothing retainable.
    expect(swept).toEqual(['rate_limits', 'system_settings.daily_counters'])
  })
})

// ─── The cron route ──────────────────────────────────────────────────────────

describe('B9-D — the cron route gates deletion behind two independent switches', () => {
  const routeSource = readFileSync(path.join(ROOT, 'app/api/cron/cleanup/route.ts'), 'utf8')

  it('keeps the canonical cron authorization', () => {
    expect(routeSource).toContain("actor: { allow: ['cron', 'admin'] }")
    expect(routeSource).toContain('withRoute')
  })

  it('defaults dryRun to true', () => {
    expect(routeSource).toContain("typeof body.dryRun === 'boolean' ? body.dryRun : true")
  })

  it('requires an environment flag in addition to an explicit dryRun: false', () => {
    expect(routeSource).toContain("process.env.RETENTION_DELETE_ENABLED === 'true'")
    expect(routeSource).toContain('const dryRun = requestedDryRun || !deletionEnabled')
  })

  it('reports the correlation id from B9-B', () => {
    expect(routeSource).toContain('requestId')
  })

  it('wires avatar orphan cleanup to the same dry-run decision', () => {
    expect(routeSource).toContain('cleanupOrphanedAvatars({ dryRun, minAgeHours: 24 })')
  })
})

describe('B9-D — the migration is additive', () => {
  const migration = readFileSync(
    path.resolve(ROOT, '../../supabase/migrations/20260915000001_retention_hold_b9d.sql'),
    'utf8'
  )

  it('adds columns and indexes idempotently', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS retention_hold boolean NOT NULL DEFAULT false')
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS')
  })

  it('drops nothing and deletes nothing', () => {
    const sql = migration.replace(/--.*/g, '')

    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/\bDELETE\b/i)
    expect(sql).not.toMatch(/\bTRUNCATE\b/i)
  })

  it('gives no hold column to admin_audit_logs, which is never swept', () => {
    const sql = migration.replace(/--.*/g, '')
    expect(sql).not.toContain('admin_audit_logs')
  })

  it('ships a rollback alongside, per repository convention', () => {
    const down = readFileSync(
      path.resolve(ROOT, '../../supabase/migrations/rollback/20260915000001_retention_hold_b9d.down.sql'),
      'utf8'
    )
    expect(down).toContain('DROP COLUMN IF EXISTS retention_hold')
  })
})

// ─── Observability ───────────────────────────────────────────────────────────

describe('B9-D — the sweep is observable through B9-C', () => {
  let spy: any

  beforeEach(() => {
    spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.stubEnv('PRODILY_LOG_IN_TESTS', 'true')
  })

  it('logs a start and a completion with the totals', async () => {
    const { db } = createDb({})

    await runRetentionSweep(db, { dryRun: true, now: NOW })

    const events = spy.mock.calls.map((c: any[]) => String(c[0]))
    expect(events.some((e: string) => e.includes('retention.sweep_started'))).toBe(true)
    expect(events.some((e: string) => e.includes('retention.sweep_completed'))).toBe(true)

    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })
})
