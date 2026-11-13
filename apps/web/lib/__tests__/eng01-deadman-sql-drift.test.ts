/**
 * ENG-01 (audit W3, plan PR-11 follow-up): the held dead-man check
 * (supabase/migrations/pending-approval/20261030000001_cron_heartbeat_deadman.sql) repeats the
 * scheduled job intervals from CRON_JOB_DEFINITIONS in SQL. This test parses that list and fails
 * when the two drift apart, and pins that the migration ships its rollback and validation files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { CRON_JOB_DEFINITIONS } from '../monitoring/cron-heartbeat'

const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const pendingDir = path.join(migrationsDir, 'pending-approval')
const NAME = '20261030000001_cron_heartbeat_deadman'
const forwardPath = path.join(pendingDir, `${NAME}.sql`)
const rollbackPath = path.join(pendingDir, 'rollback', `${NAME}.down.sql`)
const validationPath = path.join(pendingDir, 'validation', `${NAME}_validation.sql`)

const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

/**
 * Returns the (job, interval minutes) pairs between the `-- intervals:begin` and
 * `-- intervals:end` markers of the dead-man function, sorted by job. Throws when the markers
 * are missing, so a refactor of the SQL cannot silently empty the comparison.
 */
function parseDeadmanIntervals(sql: string): Array<[string, number]> {
  const match = /--\s*intervals:begin[^\n]*\n([\s\S]*?)--\s*intervals:end/.exec(sql)
  if (!match) throw new Error('intervals:begin / intervals:end markers not found in the dead-man SQL')
  const pairs: Array<[string, number]> = []
  for (const row of code(match[1]).matchAll(/\(\s*'([a-z0-9-]+)'\s*,\s*(\d+)\s*\)/g)) {
    pairs.push([row[1], Number(row[2])])
  }
  return pairs.sort(([a], [b]) => a.localeCompare(b))
}

/** The scheduled jobs from CRON_JOB_DEFINITIONS (manual jobs have no interval and are excluded). */
function scheduledIntervals(): Array<[string, number]> {
  return CRON_JOB_DEFINITIONS.filter((j) => j.intervalMinutes !== null)
    .map((j): [string, number] => [j.job, j.intervalMinutes as number])
    .sort(([a], [b]) => a.localeCompare(b))
}

describe(`held migration ${NAME}`, () => {
  it('lives only under pending-approval, with its rollback and validation companions', () => {
    expect(fs.existsSync(forwardPath)).toBe(true)
    expect(fs.existsSync(rollbackPath)).toBe(true)
    expect(fs.existsSync(validationPath)).toBe(true)
    for (const dir of [migrationsDir, path.join(migrationsDir, 'rollback'), path.join(migrationsDir, 'validation')]) {
      expect(fs.readdirSync(dir).filter((f) => f.includes('20261030000001'))).toEqual([])
    }
  })

  it('checks exactly the scheduled jobs, at the intervals in CRON_JOB_DEFINITIONS', () => {
    const parsed = parseDeadmanIntervals(read(forwardPath))
    expect(parsed.length).toBeGreaterThan(0)
    expect(parsed).toEqual(scheduledIntervals())
  })

  it('never checks the manual retry-failed job', () => {
    const jobs = parseDeadmanIntervals(read(forwardPath)).map(([job]) => job)
    expect(jobs).not.toContain('retry-failed')
    expect(CRON_JOB_DEFINITIONS.find((j) => j.job === 'retry-failed')?.intervalMinutes).toBeNull()
  })

  it('names this test as its drift check', () => {
    expect(read(forwardPath)).toContain('eng01-deadman-sql-drift.test.ts')
  })
})

describe(`rollback for ${NAME}`, () => {
  const sql = () => code(read(rollbackPath))

  it('unschedules the job only if it exists, drops the function and deletes the alert markers', () => {
    expect(sql()).toMatch(/IF EXISTS \(SELECT 1 FROM cron\.job WHERE jobname = 'prodily-deadman-cron-heartbeats'\) THEN\s+PERFORM cron\.unschedule\('prodily-deadman-cron-heartbeats'\);/)
    expect(sql()).toContain('DROP FUNCTION IF EXISTS private.check_cron_heartbeats_deadman();')
    expect(sql()).toMatch(/DELETE FROM public\.system_settings WHERE key LIKE 'cron\\_deadman\\_alert:%';/)
  })

  it('leaves the extensions, the private schema and the Vault secrets alone', () => {
    expect(sql()).not.toMatch(/DROP\s+EXTENSION/i)
    expect(sql()).not.toMatch(/DROP\s+SCHEMA/i)
    expect(sql()).not.toMatch(/vault\./i)
    expect(sql()).not.toMatch(/cron_heartbeat:|cron_heartbeat_alert:/)
  })
})

describe(`validation for ${NAME}`, () => {
  const sql = () => code(read(validationPath))

  it('is read-only and never reads a decrypted secret', () => {
    expect(sql()).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|GRANT|REVOKE|TRUNCATE)\b/i)
    expect(sql()).not.toMatch(/cron\.(un)?schedule/i)
    expect(sql()).not.toContain('decrypted_secret')
  })

  it('checks the schedule, the function privileges, recent runs and the Vault secret', () => {
    expect(sql()).toContain("schedule = '*/15 * * * *'")
    expect(sql()).toContain('prosecdef')
    expect(sql()).toContain(`proconfig @> ARRAY['search_path=""']`)
    expect(sql()).toMatch(/has_function_privilege\('anon'/)
    expect(sql()).toMatch(/has_function_privilege\('authenticated'/)
    expect(sql()).toContain('cron.job_run_details')
    expect(sql()).toMatch(/FROM vault\.secrets\s+WHERE name = 'cron_alert_webhook_url'/)
    expect(sql()).toContain("RAISE NOTICE '20261030000001 validation passed")
  })
})
