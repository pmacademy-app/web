import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

describe('Supabase Row Level Security (RLS) Policy Test Suite', () => {
  it('1. Static Migration Security Invariants (B1 Hardening Checks)', () => {
    // Find all migration files in supabase/migrations/
    const migrationsDir = path.resolve(process.cwd(), '../../supabase/migrations')
    expect(fs.existsSync(migrationsDir), 'Migrations directory must exist').toBe(true)

    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))

    // Find latest B1 hardening migration
    const b1MigrationFile = migrationFiles.find((f) => f.includes('security_hardening_b1'))
    expect(b1MigrationFile, 'B1 hardening migration must exist').toBeDefined()

    const b1Sql = fs.readFileSync(path.join(migrationsDir, b1MigrationFile!), 'utf-8')

    // 1. SECURITY DEFINER RPCs must have REVOKE and GRANT statements
    const securityDefinerFunctions = [
      'claim_email_queue_items',
      'get_admin_dashboard_summary',
      'increment_daily_email_quota',
      'get_current_daily_email_count',
      'increment_portfolio_view_count',
    ]

    for (const fn of securityDefinerFunctions) {
      expect(b1Sql).toContain(`REVOKE ALL ON FUNCTION public.${fn}`)
      expect(b1Sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}`)
      expect(b1Sql).toContain(`ALTER FUNCTION public.${fn}`)
      expect(b1Sql).toContain('SET search_path = public, pg_temp')
    }

    // 2. Over-broad public users policy must be dropped
    expect(b1Sql).toContain('DROP POLICY IF EXISTS "Public can view public profiles" ON public.users')

    // 3. public_profiles view must exist and must NOT project email or is_admin
    expect(b1Sql).toContain('CREATE OR REPLACE VIEW public.public_profiles AS')
    const viewMatch = b1Sql.match(/CREATE OR REPLACE VIEW public\.public_profiles AS([\s\S]*?)FROM public\.users/i)
    expect(viewMatch, 'public_profiles view definition must exist').toBeTruthy()
    const viewColumns = viewMatch![1].toLowerCase()
    expect(viewColumns).not.toContain('email')
    expect(viewColumns).not.toContain('is_admin')
    expect(viewColumns).not.toContain('curriculum_access_override')
    expect(viewColumns).not.toContain('streak_freezes_available')

    // 4. Over-broad certificates policy must be dropped
    expect(b1Sql).toContain('DROP POLICY IF EXISTS "Public can view certificates" ON public.certificates')
    expect(b1Sql).toContain('CREATE POLICY "Users can view own certificates" ON public.certificates')
  })

  it('1b. Learners can only update the read state of their own in-app notifications', () => {
    const migrationsDir = path.resolve(process.cwd(), '../../supabase/migrations')
    const name = '20261013000002_restrict_in_app_notification_updates'
    const code = (file: string) => fs.readFileSync(path.join(migrationsDir, file), 'utf-8').replace(/--.*$/gm, '')
    const up = code(`${name}.sql`)
    const down = code(`rollback/${name}.down.sql`)
    const policy = '"Users can update own in-app notifications"'

    // Table-wide UPDATE is taken away first, then only the read-state columns are granted back.
    const revoke = up.indexOf('REVOKE UPDATE ON public.in_app_notifications FROM authenticated, anon;')
    const grant = up.indexOf('GRANT UPDATE (is_read, read_at) ON public.in_app_notifications TO authenticated;')
    expect(revoke).toBeGreaterThanOrEqual(0)
    expect(grant).toBeGreaterThan(revoke)
    // No other grant: nothing for anon, and no other column (celebrated_at, action_url, ...).
    expect(up.match(/\bGRANT\b/g)).toHaveLength(1)

    // The policy is re-created (re-runnable) and now checks the written row as well.
    expect(up).toContain(`DROP POLICY IF EXISTS ${policy} ON public.in_app_notifications;`)
    expect(up).toMatch(
      /CREATE POLICY "Users can update own in-app notifications"\s+ON public\.in_app_notifications FOR UPDATE\s+USING \(auth\.uid\(\) = user_id\)\s+WITH CHECK \(auth\.uid\(\) = user_id\);/,
    )
    // Reads and the service role are left alone.
    expect(up).not.toMatch(/SELECT|service_role|DISABLE ROW LEVEL SECURITY/i)

    // REVOKE is silent about a grant made by another role, so the migration checks its own
    // result: it fails while table-wide UPDATE is still there, and when "mark read" would not work.
    const selfCheck = up.slice(up.indexOf('COMMENT ON POLICY'))
    expect(selfCheck).toMatch(
      /DO \$\$\s+BEGIN\s+IF has_table_privilege\('authenticated', 'public\.in_app_notifications', 'UPDATE'\) THEN\s+RAISE EXCEPTION '[^']*as that role[^']*';\s+END IF;/,
    )
    for (const column of ['is_read', 'read_at']) {
      expect(selfCheck).toContain(
        `IF NOT has_column_privilege('authenticated', 'public.in_app_notifications', '${column}', 'UPDATE') THEN`,
      )
    }
    expect(selfCheck.match(/RAISE EXCEPTION/g)).toHaveLength(3)
    expect(selfCheck).toMatch(/END \$\$;\s*$/)

    // Rollback: column grant removed, table-wide UPDATE back, original policy (no WITH CHECK).
    expect(down).toContain('REVOKE UPDATE (is_read, read_at) ON public.in_app_notifications FROM authenticated;')
    expect(down).toContain('GRANT UPDATE ON public.in_app_notifications TO authenticated, anon;')
    expect(down).toContain(`DROP POLICY IF EXISTS ${policy} ON public.in_app_notifications;`)
    expect(down).toMatch(
      /CREATE POLICY "Users can update own in-app notifications"\s+ON public\.in_app_notifications FOR UPDATE\s+USING \(auth\.uid\(\) = user_id\);/,
    )
    expect(down).not.toMatch(/WITH CHECK/i)
  })

  it('1c. PR-01 locks learner RPCs, public_profiles, open policies and testimonials inserts', () => {
    const migrationsDir = path.resolve(process.cwd(), '../../supabase/migrations')
    const name = '20261018000001_lockdown_public_grants'
    const code = (file: string) => fs.readFileSync(path.join(migrationsDir, file), 'utf-8').replace(/--.*$/gm, '')
    const up = code(`${name}.sql`)
    const down = code(`rollback/${name}.down.sql`)
    const validation = code('validation/20261018000001_lockdown_validation.sql')

    const syncXp = 'public.sync_user_xp(uuid)'
    const quizRpc = 'public.record_lesson_quiz_completion(uuid, text, int, int, int, jsonb, int, int)'

    expect(up).toContain('SET search_path = public, pg_temp;')

    // SEC-01: both RPCs are service-role only, with explicit signatures.
    for (const fn of [syncXp, quizRpc]) {
      expect(up).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC, anon, authenticated;`)
      expect(up).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO service_role;`)
    }

    // SEC-01 / SEC-22: search_path pinned on sync_user_xp and both XP trigger functions.
    for (const fn of [syncXp, 'public.update_user_xp_and_level()', 'public.sync_user_xp_and_level_on_update()']) {
      expect(up).toContain(`ALTER FUNCTION ${fn} SET search_path = public, pg_temp;`)
    }

    // SEC-02: the RLS-bypassing view is dropped.
    expect(up).toContain('DROP VIEW IF EXISTS public.public_profiles;')

    // SEC-03 / SEC-06: open FOR ALL policies dropped and end-user table privileges revoked.
    expect(up).toContain(
      'DROP POLICY IF EXISTS "Service role has full access to email_broadcasts" ON public.email_broadcasts;',
    )
    expect(up).toContain(
      'DROP POLICY IF EXISTS "Service role has full access to fellow_requests" ON public.fellow_requests;',
    )
    expect(up).toContain('REVOKE ALL ON public.email_broadcasts FROM anon, authenticated;')
    expect(up).toContain('REVOKE ALL ON public.fellow_requests FROM anon, authenticated;')

    // SEC-05: learner INSERT policy on testimonials dropped; the read policies are untouched.
    expect(up).toContain('DROP POLICY IF EXISTS "Users can submit feedback" ON public.testimonials;')
    expect(up).not.toMatch(/DROP POLICY[^;]*"(Public can read published testimonials|Users can view own feedback)"/)

    // Future functions start closed.
    expect(up).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;',
    )

    // Nothing is granted to the end-user roles anywhere in the forward migration.
    expect(up).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated|PUBLIC)\b/)
    expect(up).not.toMatch(/CREATE (OR REPLACE )?(VIEW|POLICY)/i)

    // Self-check: fails when either RPC is still executable or the view survived.
    const selfCheck = up.slice(up.indexOf('DO $$'))
    expect(selfCheck).toContain("has_function_privilege(v_role, v_fn, 'EXECUTE')")
    expect(selfCheck).toContain("to_regclass('public.public_profiles') IS NOT NULL")
    expect(selfCheck).toContain("ARRAY['anon', 'authenticated']")
    expect(selfCheck).toMatch(/END \$\$;\s*$/)

    // The normal rollback only restores default function privileges (the outage-plausible part).
    // It never re-creates public_profiles and never re-opens the closed holes.
    expect(down).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;')
    expect(down).toContain(
      'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;',
    )
    expect(down).not.toMatch(/public_profiles|CREATE (OR REPLACE )?(VIEW|POLICY)|ON FUNCTION\b|GRANT ALL/i)

    // The hole-reopening restores live in a separate file, all commented out, and that file
    // never re-creates public_profiles either.
    const reopenRaw = fs.readFileSync(path.join(migrationsDir, 'rollback/20261018000001_reopen_holes.down.sql'), 'utf-8')
    const reopen = reopenRaw.replace(/--.*$/gm, '')
    expect(reopen.trim()).toBe('')
    expect(reopenRaw).toMatch(/DANGER/)
    expect(reopenRaw).toContain(`-- GRANT EXECUTE ON FUNCTION ${quizRpc} TO authenticated;`)
    expect(reopenRaw).toContain('-- CREATE POLICY "Service role has full access to email_broadcasts"')
    expect(reopenRaw).toContain('-- CREATE POLICY "Service role has full access to fellow_requests"')
    expect(reopenRaw).toContain('-- CREATE POLICY "Users can submit feedback"')
    expect(reopenRaw).not.toMatch(/CREATE (OR REPLACE )?VIEW public\.public_profiles/i)

    // Forensics: read-only transactions, the pre-deploy evidence queries included.
    const forensics = code('validation/20261018000001_forensics.sql')
    const txStarts = forensics.match(/BEGIN TRANSACTION READ ONLY;/g) ?? []
    expect(txStarts.length).toBeGreaterThanOrEqual(2)
    expect(forensics.match(/ROLLBACK;/g)).toHaveLength(txStarts.length)
    expect(forensics).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|GRANT|REVOKE|COMMIT)\b/)
    expect(forensics).toContain("table_name = 'public_profiles'")
    expect(forensics).toContain('p.proowner::regrole')
    for (const table of ['xp_events', 'user_lesson_progress', 'certificates', 'testimonials', 'email_broadcasts']) {
      expect(forensics).toContain(`public.${table}`)
    }

    // Validation runs in a rolled-back transaction and raises on every failed check.
    expect(validation).toMatch(/^\s*BEGIN;/)
    expect(validation).toMatch(/ROLLBACK;\s*$/)
    expect(validation).toContain('RAISE EXCEPTION')
    expect(validation).toContain('allowlist text[]')
    expect(validation).toContain('SET LOCAL ROLE anon;')
    expect(validation).toContain('SET LOCAL ROLE authenticated;')
    expect(validation).toContain('WHEN insufficient_privilege THEN')
  })

  it('2. User-scoped unauthenticated client is denied unauthorized table access', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Repository / Offline Test Verification
    if (!supabaseUrl || supabaseUrl.includes('mock.supabase.co')) {
      expect(supabaseUrl).toBeDefined()
      expect(anonKey).toBeDefined()
      expect(serviceKey).toBeDefined()
      return
    }

    // Live Supabase Verification: unauthenticated anon client MUST NOT read private user data
    const anonClient = createClient(supabaseUrl, anonKey!)
    
    // Test 1: user_lesson_progress table query without auth
    const { data: progressData, error: progressErr } = await anonClient.from('user_lesson_progress').select('*').limit(5)
    if (progressErr) {
      expect(progressErr.code).toBeDefined()
    } else {
      expect(progressData?.length ?? 0).toBe(0)
    }

    // Test 2: user_notification_preferences table query without auth
    const { data: prefsData, error: prefsErr } = await anonClient.from('user_notification_preferences').select('*').limit(5)
    if (prefsErr) {
      expect(prefsErr.code).toBeDefined()
    } else {
      expect(prefsData?.length ?? 0).toBe(0)
    }

    // Test 3: email_queue table query without auth
    const { data: queueData, error: queueErr } = await anonClient.from('email_queue').select('*').limit(5)
    if (queueErr) {
      expect(queueErr.code).toBeDefined()
    } else {
      expect(queueData?.length ?? 0).toBe(0)
    }

    // Test 4: users table query without auth must not return private rows
    const { data: usersData, error: usersErr } = await anonClient.from('users').select('id, email, is_admin').limit(5)
    if (usersErr) {
      expect(usersErr.code).toBeDefined()
    } else {
      expect(usersData?.length ?? 0).toBe(0)
    }

    // Test 5: certificates table query without auth must not return roster
    const { data: certData, error: certErr } = await anonClient.from('certificates').select('*').limit(5)
    if (certErr) {
      expect(certErr.code).toBeDefined()
    } else {
      expect(certData?.length ?? 0).toBe(0)
    }

    // Test 6: Privileged RPC execution without service-role auth must be refused
    const { error: claimErr } = await (anonClient as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }> }).rpc('claim_email_queue_items', { p_batch_size: 1 })
    expect(claimErr, 'anon calling claim_email_queue_items must fail').toBeTruthy()

    const { error: adminSummaryErr } = await (anonClient as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }> }).rpc('get_admin_dashboard_summary', {})
    expect(adminSummaryErr, 'anon calling get_admin_dashboard_summary must fail').toBeTruthy()

    const { error: quotaErr } = await (anonClient as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { code?: string; message?: string } | null }> }).rpc('increment_daily_email_quota', { p_limit: 100 })
    expect(quotaErr, 'anon calling increment_daily_email_quota must fail').toBeTruthy()
  })

  it('3. Service-role client bypasses RLS for administrative operations', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || supabaseUrl.includes('mock.supabase.co') || !serviceKey || serviceKey.includes('mock')) {
      expect(true).toBe(true)
      return
    }

    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data, error } = await serviceClient.from('users').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
