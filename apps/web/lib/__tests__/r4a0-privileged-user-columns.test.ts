import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Growth R4 / A0: learners can update their own users row, so is_admin, is_fellow and the two
// admin overrides need a database-level guard. The behaviour itself is checked against staging by
// supabase/migrations/validation/r4a0_privileged_columns_validation.sql; this suite pins the
// migration's shape and the assumption it rests on (only service-role code writes these columns).

const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), 'utf8')

const MIGRATION = '20261010000001_guard_privileged_user_columns.sql'
const PRIVILEGED = [
  'is_admin',
  'is_fellow',
  'curriculum_access_override',
  'portfolio_verification_override',
] as const

/** The SQL without `--` comments, so assertions only see executable statements. */
const code = (sql: string) => sql.replace(/--.*$/gm, '')

describe('R4-A0 privileged user column guard', () => {
  const sql = code(read(migrationsDir, MIGRATION))

  it('fires before INSERT and UPDATE on public.users', () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON public\.users/)
    expect(sql).toMatch(/EXECUTE FUNCTION public\.guard_privileged_user_columns\(\)/)
  })

  it.each(PRIVILEGED)('guards %s on update and insert', (column) => {
    expect(sql).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`)
    const insertBranch = sql.slice(sql.indexOf("TG_OP = 'INSERT'"), sql.indexOf('RETURN NEW;\n  END IF;\n\n  IF NEW.'))
    expect(insertBranch).toContain(`NEW.${column}`)
  })

  it('restricts only the end-user roles and runs as the caller', () => {
    expect(sql).toMatch(/current_user NOT IN \('authenticated', 'anon'\)/)
    // SECURITY DEFINER would make current_user the function owner and disable the guard.
    expect(sql).not.toMatch(/SECURITY DEFINER/i)
  })

  it('pins search_path on the trigger function', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.guard_privileged_user_columns\(\)\s+RETURNS trigger\s+LANGUAGE plpgsql\s+SET search_path = public, pg_temp\s+AS \$\$/
    )
  })

  it('documents the role check as a deny-list that new PostgREST roles must join', () => {
    const raw = read(migrationsDir, MIGRATION)
    expect(raw).toMatch(/deny-list, not an allow-list/)
    expect(raw).toMatch(/new role that PostgREST can switch to/)
  })

  it('raises insufficient_privilege (42501)', () => {
    expect(sql.match(/ERRCODE = '42501'/g)?.length).toBe(2)
  })

  it('ships a rollback and a staging validation script', () => {
    const down = code(read(migrationsDir, 'rollback', MIGRATION.replace('.sql', '.down.sql')))
    expect(down).toMatch(/DROP TRIGGER IF EXISTS trigger_guard_privileged_user_columns ON public\.users/)
    expect(down).toMatch(/DROP FUNCTION IF EXISTS public\.guard_privileged_user_columns\(\)/)
    expect(fs.existsSync(path.join(migrationsDir, 'validation', 'r4a0_privileged_columns_validation.sql'))).toBe(true)
  })

  it('validates INSERT as a learner and as anon, and leaves nothing behind', () => {
    const validation = code(read(migrationsDir, 'validation', 'r4a0_privileged_columns_validation.sql'))

    expect(validation).toMatch(/INSERT INTO public\.users \(id, is_admin\) VALUES \(v_uid, true\);/)
    expect(validation).toMatch(/SET LOCAL ROLE anon;/)
    expect(validation).toMatch(/INSERT INTO public\.users \(id, is_admin\) VALUES \(gen_random_uuid\(\), true\);/)
    // Both INSERT checks must tell the guard apart from an RLS refusal, which is also 42501.
    expect(validation.match(/NOT LIKE 'privileged user columns%'/g)).toHaveLength(2)
    // A role with no INSERT grant on the table never reaches the guard: reported, not a failure,
    // for the learner as well as for anon.
    expect(validation.match(/IF v_rejected_by LIKE 'permission denied for%' THEN\s+RAISE NOTICE/g)).toHaveLength(2)
    // One transaction, rolled back, with every role switch undone before the end.
    expect(validation.trimStart().startsWith('BEGIN;')).toBe(true)
    expect(validation.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    expect(validation).not.toMatch(/\bCOMMIT\b/)
    expect(validation.match(/SET LOCAL ROLE/g)).toHaveLength(validation.match(/RESET ROLE;/g)?.length ?? 0)
  })
})

describe('R4-A0 assumption: only the service role writes privileged columns', () => {
  const webRoot = path.resolve(__dirname, '../..')
  const service = read(webRoot, 'lib/admin/service.ts')

  it.each([
    ['toggleUserAdminRole', 'is_admin'],
    ['toggleUserFellowStatus', 'is_fellow'],
  ])('%s writes %s through createServiceRoleClient', (method, column) => {
    const start = service.indexOf(`public static async ${method}(`)
    expect(start).toBeGreaterThan(-1)
    const body = service.slice(start, service.indexOf('public static async', start + 1))
    expect(body).toContain('createServiceRoleClient()')
    expect(body).toContain(`${column}:`)
  })

  it('writes portfolio_verification_override through createServiceRoleClient', () => {
    const at = service.indexOf('.update({ portfolio_verification_override')
    expect(at).toBeGreaterThan(-1)
    const methodStart = service.lastIndexOf('public static async', at)
    expect(service.slice(methodStart, at)).toContain('createServiceRoleClient()')
  })
})
