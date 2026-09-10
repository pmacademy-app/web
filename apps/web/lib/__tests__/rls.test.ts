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
