/**
 * Held migration 20261119000007_security_events and the retention entries for its
 * tables. The SQL cannot run here (no database in unit tests, and agents never connect
 * to one), so these tests pin the text against the contract with the admin console and
 * against the app's event type union.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { SECURITY_EVENT_TYPES } from '@/lib/security/security-events'
import { RETENTION_RULES } from '@/lib/retention/policy'
import { runRetentionSweep, sweepRule } from '@/lib/retention/sweep'

vi.mock('@/lib/monitoring/logger', () => ({ logErrorReport: vi.fn(), logSystemError: vi.fn() }))

const NAME = '20261119000007_security_events'
const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const pendingDir = path.join(migrationsDir, 'pending-approval')
const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const code = (sql: string) => sql.replace(/--.*$/gm, '')
const EM_DASH = String.fromCharCode(0x2014)

const FORWARD = path.join(pendingDir, `${NAME}.sql`)
const ROLLBACK = path.join(pendingDir, 'rollback', `${NAME}.down.sql`)
const VALIDATION = path.join(pendingDir, 'validation', `${NAME}_validation.sql`)
const FN = 'public.record_security_event(text, text, text, text, text, text)'

const quoted = (block: string) => [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])

describe(`held migration ${NAME}`, () => {
  const sql = code(read(FORWARD))

  it('lives only under pending-approval, with rollback and validation companions', () => {
    for (const p of [FORWARD, ROLLBACK, VALIDATION]) expect(fs.existsSync(p), p).toBe(true)
    for (const dir of [migrationsDir, path.join(migrationsDir, 'rollback'), path.join(migrationsDir, 'validation')]) {
      expect(fs.readdirSync(dir).filter((file) => file.includes('20261119000007'))).toEqual([])
    }
    const raw = read(FORWARD)
    expect(raw).toContain('HELD IN pending-approval/')
    expect(raw).toContain(`rollback/${NAME}.down.sql`)
    expect(raw).toContain(`validation/${NAME}_validation.sql`)
  })

  it('has an event type CHECK that equals the exported union, in order', () => {
    const check = /security_event_counts_event_type_check CHECK \(event_type IN \(([\s\S]*?)\)\)/.exec(sql)
    expect(check).not.toBeNull()
    expect(quoted(check![1])).toEqual([...SECURITY_EVENT_TYPES])
  })

  it('lists the same event types in the validation file', () => {
    const block = /FOREACH v_type IN ARRAY ARRAY\[([\s\S]*?)\]/.exec(code(read(VALIDATION)))
    expect(block).not.toBeNull()
    expect(quoted(block![1])).toEqual([...SECURITY_EVENT_TYPES])
  })

  it('creates both tables with the contract columns and constraints', () => {
    for (const column of [
      'day date NOT NULL',
      'event_type text NOT NULL',
      'app text NOT NULL',
      "ip_bucket text NOT NULL DEFAULT ''",
      "subject_hash text NOT NULL DEFAULT ''",
      'subject_hint text NULL',
      'sample_path text NULL',
      'count integer NOT NULL DEFAULT 0',
      'first_seen timestamptz NOT NULL DEFAULT now()',
      'last_seen timestamptz NOT NULL DEFAULT now()',
      'day date PRIMARY KEY',
      'generated_at timestamptz NOT NULL DEFAULT now()',
      "summary jsonb NOT NULL DEFAULT '{}'::jsonb",
      "findings jsonb NOT NULL DEFAULT '[]'::jsonb",
    ]) {
      expect(sql).toContain(column)
    }
    expect(sql).toContain("CHECK (app IN ('web', 'admin'))")
    expect(sql).toContain("CHECK (severity IN ('none', 'low', 'medium', 'high'))")
    expect(sql).toContain('UNIQUE (day, event_type, app, ip_bucket, subject_hash)')
    expect(sql).toMatch(/ON public\.security_event_counts \(day, event_type\);/)
  })

  it('enables RLS with no policy and grants only service_role', () => {
    for (const table of ['security_event_counts', 'security_digests']) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`)
      expect(sql).toContain(`REVOKE ALL ON public.${table} FROM PUBLIC, anon, authenticated;`)
      expect(sql).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON public.${table} TO service_role;`)
    }
    expect(sql).not.toMatch(/CREATE POLICY/)
    expect(sql).not.toMatch(/^\s*GRANT\b[^;]*\b(anon|authenticated|PUBLIC)\b/m)
  })

  it('defines the function as SECURITY DEFINER with a pinned search_path, service role only', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.record_security_event\(\s*p_event_type text,\s*p_app text,\s*p_ip_bucket text,\s*p_subject_hash text,\s*p_subject_hint text,\s*p_path text\s*\)\s*RETURNS void/
    )
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/)
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${FN} FROM PUBLIC, anon, authenticated;`)
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${FN} TO service_role;`)
  })

  it('computes the IST day, truncates inputs and keeps first_seen on upsert', () => {
    expect(sql).toContain("(now() AT TIME ZONE 'Asia/Kolkata')::date")
    expect(sql).toMatch(/left\(btrim\(coalesce\(p_ip_bucket, ''\)\), 64\)/)
    expect(sql).toMatch(/, 32\)/)
    expect(sql).toMatch(/, 120\)/)
    expect(sql).toMatch(/, 200\)/)
    expect(sql).toMatch(/ON CONFLICT \(day, event_type, app, ip_bucket, subject_hash\) DO UPDATE/)
    const upsert = sql.slice(sql.indexOf('ON CONFLICT'))
    expect(upsert).not.toMatch(/first_seen\s*=/)
    expect(upsert).toContain('sample_path = coalesce(c.sample_path, EXCLUDED.sample_path)')
  })

  it('has the 50000-rows-a-day flood guard after the existing-key update', () => {
    const update = sql.indexOf('UPDATE public.security_event_counts')
    const guard = sql.indexOf('IF v_rows >= 50000 THEN')
    const insert = sql.indexOf('INSERT INTO public.security_event_counts')
    expect(update).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(update)
    expect(insert).toBeGreaterThan(guard)
    expect(sql).toMatch(/WHERE day = v_day LIMIT 50000/)
  })

  it('ends with a self-check DO block that raises on grants, RLS and the function', () => {
    const doAt = sql.lastIndexOf('DO $$')
    const check = sql.slice(doAt)
    expect(doAt).toBeGreaterThan(-1)
    expect(check).toMatch(/RAISE EXCEPTION/)
    expect(check).toContain('relrowsecurity')
    expect(check).toContain('pg_policies')
    expect(check).toContain('has_function_privilege')
    expect(check).toContain('prosecdef')
    expect(sql.trimEnd().endsWith('END $$;')).toBe(true)
  })

  it('rollback drops the function and both tables', () => {
    const down = code(read(ROLLBACK))
    expect(down).toContain(`DROP FUNCTION IF EXISTS ${FN};`)
    expect(down).toContain('DROP TABLE IF EXISTS public.security_digests;')
    expect(down).toContain('DROP TABLE IF EXISTS public.security_event_counts;')
  })

  it('validation is read-only, rolls back and checks that clients cannot execute', () => {
    const raw = read(VALIDATION)
    expect(raw).toMatch(/^BEGIN;$/m)
    expect(raw.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(code(raw)).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+(\.\w+)?\s+SET|DELETE\s+FROM|ALTER\s|DROP\s|CREATE\s|GRANT\s|REVOKE\s|TRUNCATE\s)/)
    expect(raw).toContain('20261119000007 validation passed')
    expect(raw).toContain("FOREACH v_role IN ARRAY ARRAY['public', 'anon', 'authenticated']")
    expect(raw).toContain("has_function_privilege(v_role, v_fn, 'EXECUTE')")
    expect(raw).toContain('information_schema.columns')
  })

  it('is replayed by CI, listed in the apply order and adds nothing to the grant allowlist', () => {
    const held = read(path.join(repoRoot, 'supabase/tests/held-migrations.txt')).split('\n').map((l) => l.trim())
    expect(held).toContain(`${NAME}.sql`)
    const readme = read(path.join(pendingDir, 'README.md'))
    expect(readme).toMatch(/\d+\. `20261119000007_security_events\.sql`/)
    expect(readme).toContain(`### \`${NAME}.sql\``)
    const allowlist = code(read(path.join(repoRoot, 'supabase/tests/grant_allowlist.sql')))
    expect(allowlist).not.toMatch(/security_event_counts|security_digests|record_security_event/)
  })

  it('carries no em-dashes', () => {
    for (const p of [FORWARD, ROLLBACK, VALIDATION]) expect(read(p)).not.toContain(EM_DASH)
  })
})

describe('retention for the security event tables', () => {
  const NOW = new Date('2026-11-19T12:00:00.000Z')

  it('keeps counters 30 days and digests 365 days, both on day', () => {
    const counts = RETENTION_RULES.find((r) => r.id === 'security_event_counts')
    const digests = RETENTION_RULES.find((r) => r.id === 'security_digests')
    expect(counts).toMatchObject({ table: 'security_event_counts', timestampColumn: 'day', idColumn: 'day', days: 30, supportsHold: false, tableMayBeMissing: true })
    expect(digests).toMatchObject({ table: 'security_digests', timestampColumn: 'day', idColumn: 'day', days: 365, supportsHold: false, tableMayBeMissing: true })
  })

  function missingTableDb(code: string) {
    const chain: Record<string, unknown> = {}
    for (const m of ['lt', 'eq', 'in', 'not', 'like']) chain[m] = () => chain
    chain.limit = async () => ({ data: null, error: { code, message: 'relation does not exist' } })
    return { from: () => ({ select: () => chain, delete: () => chain }) } as never
  }

  it.each(['PGRST205', '42P01'])('skips a table that does not exist yet (%s) instead of failing', async (missing) => {
    const rule = RETENTION_RULES.find((r) => r.id === 'security_event_counts')!
    const outcome = await sweepRule(missingTableDb(missing), rule, { dryRun: false, now: NOW })
    expect(outcome.skipped).toBe('table_missing')
    expect(outcome.error).toBeUndefined()
    expect(outcome.deleted).toBe(0)
  })

  it('still fails an established table on the same error', async () => {
    const rule = RETENTION_RULES.find((r) => r.id === 'rate_limits')!
    const outcome = await sweepRule(missingTableDb('PGRST205'), rule, { dryRun: false, now: NOW })
    expect(outcome.skipped).toBeUndefined()
    expect(outcome.error).toBeDefined()
  })

  it('a whole sweep against a database without the migration reports the two tables as skipped', async () => {
    const result = await runRetentionSweep(missingTableDb('PGRST205'), { dryRun: true, now: NOW })
    const skipped = result.rules.filter((r) => r.skipped).map((r) => r.id).sort()
    expect(skipped).toEqual(['security_digests', 'security_event_counts'])
  })

  it('deletes each expired day once, however many rows it holds', async () => {
    const deletedDays: unknown[] = []
    const rows = [{ day: '2026-10-01' }, { day: '2026-10-01' }, { day: '2026-10-02' }]
    const chain: Record<string, unknown> = {}
    for (const m of ['lt', 'eq', 'not', 'like']) chain[m] = () => chain
    chain.limit = async () => ({ data: rows.splice(0), error: null })
    const db = {
      from: () => ({
        select: () => chain,
        delete: () => ({ in: async (_c: string, v: unknown[]) => { deletedDays.push(...v); return { error: null } } }),
      }),
    } as never
    const rule = RETENTION_RULES.find((r) => r.id === 'security_event_counts')!
    const outcome = await sweepRule(db, rule, { dryRun: false, now: NOW })
    expect(deletedDays).toEqual(['2026-10-01', '2026-10-02'])
    expect(outcome.eligible).toBe(3)
    expect(outcome.error).toBeUndefined()
  })
})
