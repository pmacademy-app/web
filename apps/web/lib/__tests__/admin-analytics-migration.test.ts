import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/** B5: static checks on the admin analytics RPC migration and its rollback. */

const dir = path.resolve(__dirname, '../../../../supabase/migrations')
const code = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8').replace(/--.*$/gm, '')
const up = code('20261012000001_admin_analytics_rpc.sql')
const down = code('rollback/20261012000001_admin_analytics_rpc.down.sql')

const FUNCTIONS: Array<[name: string, args: string]> = [
  ['admin_active_users', 'timestamptz, timestamptz'],
  ['admin_lesson_completion_stats', 'jsonb'],
  ['admin_capstone_stats', 'timestamptz, timestamptz'],
  ['admin_flashcard_stats', ''],
  ['admin_user_stats', ''],
]

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The body of one CREATE FUNCTION statement, up to its closing `$$;`. */
function definition(name: string): string {
  const start = up.search(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`))
  expect(start, `${name} is defined`).toBeGreaterThanOrEqual(0)
  const end = up.indexOf('$$;', up.indexOf('AS $$', start))
  return up.slice(start, end + 3)
}

describe('B5 admin analytics migration', () => {
  it.each(FUNCTIONS)('%s pins search_path, is read-only and runs as the caller', (name) => {
    const def = definition(name)
    expect(def).toMatch(/SET search_path = public, pg_temp/)
    expect(def).toMatch(/\bSTABLE\b/)
    expect(def).not.toMatch(/SECURITY DEFINER/i)
    expect(def).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
  })

  it.each(FUNCTIONS)('%s is revoked from clients and granted to service_role and postgres', (name, args) => {
    const sig = esc(`public.${name}(${args})`)
    expect(up).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`))
    expect(up).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role, postgres;`))
  })

  it('declares the signatures the app calls', () => {
    expect(up).toMatch(/admin_active_users\(p_from timestamptz, p_to timestamptz\)\s+RETURNS TABLE \(user_id uuid, active_before boolean\)/)
    expect(up).toMatch(/admin_lesson_completion_stats\(p_modules jsonb DEFAULT '\[\]'::jsonb\)\s+RETURNS jsonb/)
    expect(up).toMatch(/admin_capstone_stats\(p_from timestamptz, p_to timestamptz\)\s+RETURNS jsonb/)
    expect(up).toMatch(/admin_flashcard_stats\(\)\s+RETURNS jsonb/)
    expect(up).toMatch(/admin_user_stats\(\)\s+RETURNS jsonb/)
  })

  it('computes active_before with EXISTS and orders rows for stable paging', () => {
    const def = definition('admin_active_users')
    expect(def).toMatch(/EXISTS \(/)
    expect(def).toMatch(/b\.created_at < p_from/)
    expect(def).toMatch(/ORDER BY a\.user_id/)
  })

  it('returns every jsonb key the app reads', () => {
    for (const key of ['distinct_users', 'completion_histogram', 'modules', 'lesson_count', 'started', 'completed']) {
      expect(definition('admin_lesson_completion_stats')).toContain(`'${key}'`)
    }
    for (const key of ['submitted', 'reviewed', 'submitted_at']) {
      expect(definition('admin_capstone_stats')).toContain(`'${key}'`)
    }
    for (const key of ['total', 'distinct_users']) expect(definition('admin_flashcard_stats')).toContain(`'${key}'`)
    for (const key of ['total', 'public_portfolios', 'levels', 'streaks']) {
      expect(definition('admin_user_stats')).toContain(`'${key}'`)
    }
  })

  it('treats a missing, null or non-array lesson_ids as an empty module', () => {
    const def = definition('admin_lesson_completion_stats')
    // jsonb_array_elements_text raises on a JSON null or scalar; COALESCE only covers SQL NULL.
    expect(def).toMatch(
      /jsonb_array_elements_text\(\s*CASE WHEN jsonb_typeof\(m\.value -> 'lesson_ids'\) = 'array'\s+THEN m\.value -> 'lesson_ids'\s+ELSE '\[\]'::jsonb\s+END\s*\)/
    )
    expect(def).not.toMatch(/jsonb_array_elements_text\(COALESCE/)
  })

  it('adds no index that an earlier migration already defines', () => {
    expect(up).not.toMatch(/CREATE INDEX/i)
  })

  it.each(FUNCTIONS)('the rollback drops %s', (name, args) => {
    expect(down).toMatch(new RegExp(`DROP FUNCTION IF EXISTS ${esc(`public.${name}(${args})`)};`))
  })
})

/** The overview funnel's distinct-learner counts (20261013000001) and its rollback. */
describe('admin funnel distinct users migration', () => {
  const funnelUp = code('20261013000001_admin_funnel_distinct_users.sql')
  const funnelDown = code('rollback/20261013000001_admin_funnel_distinct_users.down.sql')
  const sig = esc('public.admin_funnel_distinct_users()')

  it('pins search_path, is read-only and runs as the caller', () => {
    expect(funnelUp).toMatch(
      /CREATE OR REPLACE FUNCTION public\.admin_funnel_distinct_users\(\)\s+RETURNS jsonb\s+LANGUAGE sql\s+STABLE/
    )
    expect(funnelUp).toMatch(/SET search_path = public, pg_temp/)
    expect(funnelUp).not.toMatch(/SECURITY DEFINER/i)
    expect(funnelUp).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/i)
    expect(funnelUp).not.toMatch(/CREATE INDEX/i)
  })

  it('is revoked from clients, granted to service_role and postgres, and commented', () => {
    expect(funnelUp).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC, anon, authenticated;`))
    expect(funnelUp).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO service_role, postgres;`))
    expect(funnelUp).toMatch(new RegExp(`COMMENT ON FUNCTION ${sig} IS`))
  })

  it('counts distinct users per step, with the filters the funnel had', () => {
    expect(funnelUp).toMatch(
      /'first_lesson',\s*\(SELECT count\(DISTINCT p\.user_id\) FROM public\.user_lesson_progress p WHERE p\.status = 'completed'\)/
    )
    expect(funnelUp).toMatch(/'first_quiz',\s*\(SELECT count\(DISTINCT q\.user_id\) FROM public\.quiz_attempts q\)/)
    expect(funnelUp).toMatch(
      /'module_completion',\s*\(SELECT count\(DISTINCT c\.user_id\) FROM public\.capstone_submissions c WHERE c\.submitted_at IS NOT NULL\)/
    )
    // A bare row count is the bug this function replaces.
    expect(funnelUp).not.toMatch(/count\(\*\)/)
  })

  it('the rollback drops the function', () => {
    expect(funnelDown).toMatch(new RegExp(`DROP FUNCTION IF EXISTS ${sig};`))
  })
})
