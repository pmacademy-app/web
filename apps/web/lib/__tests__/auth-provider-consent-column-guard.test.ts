import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 20261020000001 extends the users column guard to auth_provider and the signup consent record,
// so a learner cannot PATCH their own row past the Google consent gate or forge consent. The
// behaviour is checked on staging by the validation script; this suite pins the migration's shape
// and the assumption it rests on (no learner-facing code writes these columns).

const repoRoot = path.resolve(__dirname, '../../../..')
const webRoot = path.resolve(__dirname, '../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), 'utf8')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

const NAME = '20261020000001_guard_auth_provider_and_consent_columns'
const PREVIOUS = '20261017000001_admin_guard_email_and_rpc_grants.sql'
const NEW_COLUMNS = [
  'auth_provider',
  'terms_accepted_at',
  'terms_version',
  'privacy_version',
  'age_confirmed_at',
  'age_confirmed_minimum',
] as const
const CONSENT_COLUMNS = NEW_COLUMNS.filter((c) => c !== 'auth_provider')
const EXISTING_UPDATE_CHECKS = [
  'NEW.is_admin IS DISTINCT FROM OLD.is_admin',
  'NEW.is_fellow IS DISTINCT FROM OLD.is_fellow',
  'NEW.curriculum_access_override IS DISTINCT FROM OLD.curriculum_access_override',
  'NEW.portfolio_verification_override IS DISTINCT FROM OLD.portfolio_verification_override',
  'NEW.email IS DISTINCT FROM OLD.email',
]

/** The body of guard_privileged_user_columns() as defined in a migration file. */
function functionBody(sql: string): string {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_privileged_user_columns()')
  expect(start).toBeGreaterThan(-1)
  return sql.slice(start, sql.indexOf('$$;', start))
}

describe('20261020000001 auth_provider and consent column guard', () => {
  const sql = code(read(migrationsDir, `${NAME}.sql`))
  const body = functionBody(sql)
  const insertStart = body.indexOf("TG_OP = 'INSERT'")
  const insertBranch = body.slice(insertStart, body.indexOf('RETURN NEW;', insertStart))

  it('re-creates the guard function with a pinned search_path, as the caller', () => {
    expect(sql).toMatch(/^SET search_path = public, pg_temp;/m)
    expect(body).toMatch(
      /CREATE OR REPLACE FUNCTION public\.guard_privileged_user_columns\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = public, pg_temp\s+AS \$\$/
    )
    expect(sql).not.toMatch(/SECURITY DEFINER/i)
    expect(body).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/)
  })

  it('keeps every check from the previous definition', () => {
    const previous = functionBody(code(read(migrationsDir, PREVIOUS)))
    for (const check of EXISTING_UPDATE_CHECKS) {
      expect(previous).toContain(check)
      expect(body).toContain(check)
    }
    expect(insertStart).toBeGreaterThan(-1)
    for (const column of ['is_admin', 'is_fellow', 'curriculum_access_override', 'portfolio_verification_override']) {
      expect(insertBranch).toContain(`NEW.${column}`)
    }
  })

  it.each(NEW_COLUMNS)('rejects end-user UPDATE changes to %s', (column) => {
    expect(body).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`)
  })

  it('on INSERT only allows the default provider and no consent', () => {
    expect(insertBranch).toContain("NEW.auth_provider IS DISTINCT FROM 'email'")
    for (const column of CONSENT_COLUMNS) {
      expect(insertBranch).toContain(`NEW.${column} IS NOT NULL`)
    }
  })

  it('raises insufficient_privilege (42501) for every refusal', () => {
    expect(body.match(/RAISE EXCEPTION/g)?.length).toBe(5)
    expect(body.match(/ERRCODE = '42501'/g)?.length).toBe(5)
  })

  it('does not touch grants or the trigger', () => {
    expect(sql).not.toMatch(/\bGRANT\b|\bREVOKE\b|CREATE TRIGGER|DROP TRIGGER/)
  })

  it('ships a rollback that restores the 20261017000001 definition', () => {
    const down = code(read(migrationsDir, 'rollback', `${NAME}.down.sql`))
    const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
    expect(normalize(functionBody(down))).toBe(normalize(functionBody(code(read(migrationsDir, PREVIOUS)))))
  })

  it('ships a staging validation that probes as authenticated and anon and rolls back', () => {
    const validation = code(read(migrationsDir, 'validation', `${NAME}_validation.sql`))
    expect(validation.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(validation.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(validation).not.toMatch(/\bCOMMIT\b/)
    expect(validation).toMatch(/SET LOCAL ROLE authenticated;/)
    expect(validation).toMatch(/SET LOCAL ROLE anon;/)
    expect(validation).toMatch(/RAISE EXCEPTION/)
    for (const column of NEW_COLUMNS) expect(validation).toContain(column)
    expect(validation.match(/SET LOCAL ROLE/g)).toHaveLength(validation.match(/RESET ROLE;/g)?.length ?? 0)
  })
})

describe('assumption: learner-facing code never writes provider or consent columns', () => {
  it.each(['app/onboarding/actions.ts', 'app/api/settings/profile/route.ts'])(
    '%s does not write any guarded column',
    (file) => {
      const source = read(webRoot, file)
      for (const column of NEW_COLUMNS) expect(source).not.toContain(column)
    }
  )

  it('ensureUserProfile is the only profile insert that carries them, and signup and login call it with the service role', () => {
    for (const file of ['app/api/auth/signup/route.ts', 'app/api/auth/login/route.ts']) {
      const source = read(webRoot, file)
      const call = source.indexOf('ensureUserProfile(supabase')
      expect(call).toBeGreaterThan(-1)
      const assignment = source.lastIndexOf('const supabase =', call)
      expect(source.slice(assignment, assignment + 60)).toContain('createServiceRoleClient()')
    }
  })
})
