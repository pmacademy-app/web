import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'

// SEC-07 / T29: public.users is about to lose INSERT and UPDATE for anon and authenticated
// (supabase/migrations/pending-approval/20261027000002_lock_public_users.sql). supabase-js sends
// a client's stored session token, not the service key, on every PostgREST call after a
// successful signInWithPassword / verifyOtp, so a profile write through that client runs as
// `authenticated` and would start failing. These tests pin that the login route, the signup
// route (Flow B) and the email callback do every public.users write on a service-role client
// that never signed anyone in.

// ── Tracked fake clients ────────────────────────────────────────────────────

type DbCall = { client: number; signedIn: boolean; table: string; op: string }

const h = vi.hoisted(() => {
  const state = {
    nextId: 0,
    clients: [] as Array<{ id: number; kind: string; signedIn: boolean; signInCalls: number }>,
    dbCalls: [] as Array<{ client: number; signedIn: boolean; table: string; op: string }>,
    signInResult: null as unknown,
    verifyOtpResult: null as unknown,
    createUserResult: null as unknown,
  }

  function makeClient(kind: string) {
    const meta = { id: ++state.nextId, kind, signedIn: false, signInCalls: 0 }
    state.clients.push(meta)
    const record = (table: string, op: string) =>
      state.dbCalls.push({ client: meta.id, signedIn: meta.signedIn, table, op })
    const terminal = () => Promise.resolve({ data: null, error: null })
    const builder = (table: string, op: string): Record<string, unknown> => {
      record(table, op)
      const chain: Record<string, unknown> = {}
      for (const m of ['eq', 'ilike', 'select']) chain[m] = () => chain
      chain.maybeSingle = terminal
      chain.single = terminal
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null })
      return chain
    }
    const signIn = async (result: unknown) => {
      meta.signInCalls += 1
      const r = result as { data?: { session?: unknown } }
      if (r?.data?.session) meta.signedIn = true
      return result
    }
    return {
      __meta: meta,
      auth: {
        signInWithPassword: vi.fn(() => signIn(state.signInResult)),
        verifyOtp: vi.fn(() => signIn(state.verifyOtpResult)),
        admin: {
          createUser: vi.fn(async () => state.createUserResult),
          listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          updateUserById: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      from: (table: string) => ({
        select: () => builder(table, 'select'),
        insert: () => builder(table, 'insert'),
        update: () => builder(table, 'update'),
        upsert: () => builder(table, 'upsert'),
        delete: () => builder(table, 'delete'),
      }),
    }
  }

  return {
    state,
    makeClient,
    createServiceRoleClient: vi.fn(() => makeClient('service')),
    ensureUserProfile: vi.fn(),
    applyPendingReferral: vi.fn(),
    createReferralAttribution: vi.fn(),
    isPlausibleReferralCode: vi.fn(),
  }
})

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: h.createServiceRoleClient,
  createAuthenticatedServerClient: () => h.makeClient('user-token'),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: vi.fn(() => h.makeClient('anon')) }
})

vi.mock('@/lib/auth', () => ({ ensureUserProfile: h.ensureUserProfile }))

vi.mock('@/lib/referral/referral-service', () => ({
  applyPendingReferral: h.applyPendingReferral,
  createReferralAttribution: h.createReferralAttribution,
  isPlausibleReferralCode: h.isPlausibleReferralCode,
}))

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue({ success: true }),
  evaluateSiteverifyBudget: vi.fn().mockResolvedValue({ success: true, remaining: 99, resetInMs: 60_000 }),
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: { getState: vi.fn().mockResolvedValue({ dailyLimit: 100 }) },
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 9, resetInMs: 60_000 }),
  evaluateRateLimit: vi.fn().mockResolvedValue({ success: true, remaining: 9, resetInMs: 60_000 }),
  evaluateInMemoryRateLimit: vi.fn(),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    isEmailVerificationRequired: vi.fn().mockResolvedValue(false),
    getProductSettings: vi.fn().mockResolvedValue({ allowSignups: true }),
  },
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn().mockResolvedValue('err_1'),
  logErrorReport: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: { dispatch: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as signupPOST } from '@/app/api/auth/signup/route'
import { GET as callbackGET } from '@/app/api/auth/callback/route'

type FakeClient = ReturnType<typeof h.makeClient>
const metaOf = (client: unknown) => (client as FakeClient).__meta

const USER = { id: 'usr_t29', email: 'learner@example.com', email_confirmed_at: '2026-10-01T00:00:00Z' }
const SESSION = { access_token: 'learner-access', refresh_token: 'learner-refresh', expires_in: 3600 }

function loginRequest() {
  return new NextRequest('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: USER.email, password: 'correct-horse' }),
  })
}

function usersWrites(): DbCall[] {
  return h.state.dbCalls.filter((c) => c.table === 'users' && c.op !== 'select')
}

beforeEach(() => {
  vi.clearAllMocks()
  h.state.nextId = 0
  h.state.clients.length = 0
  h.state.dbCalls.length = 0
  h.state.signInResult = { data: { user: USER, session: SESSION }, error: null }
  h.state.verifyOtpResult = { data: { user: USER, session: SESSION }, error: null }
  h.createServiceRoleClient.mockImplementation(() => h.makeClient('service'))
  h.ensureUserProfile.mockImplementation(async (client: unknown) => {
    // Stands in for the real insert so the write is attributed to the client it ran on.
    ;(client as FakeClient).from('users').insert()
    return { id: USER.id }
  })
  h.applyPendingReferral.mockResolvedValue({ created: false, reason: 'no_referrer_code' })
  h.state.createUserResult = { data: { user: USER }, error: null }
  h.isPlausibleReferralCode.mockReturnValue(false)
  h.createReferralAttribution.mockImplementation(async (client: unknown) => {
    ;(client as FakeClient).from('referrals').insert()
    return { created: true }
  })
})

// ── Login ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('signs in on one client and creates the profile on a different client that holds no session', async () => {
    const res = await loginPOST(loginRequest())
    expect(res.status).toBe(200)

    const signInClients = h.state.clients.filter((c) => c.signInCalls > 0)
    expect(signInClients).toHaveLength(1)
    expect(signInClients[0].signedIn).toBe(true)

    expect(h.ensureUserProfile).toHaveBeenCalledTimes(1)
    const profileClient = metaOf(h.ensureUserProfile.mock.calls[0][0])
    expect(profileClient.kind).toBe('service')
    expect(profileClient.id).not.toBe(signInClients[0].id)
    expect(profileClient.signInCalls).toBe(0)
    expect(profileClient.signedIn).toBe(false)

    expect(usersWrites().length).toBeGreaterThan(0)
    for (const call of usersWrites()) expect(call.signedIn).toBe(false)
  })

  it('keeps the retry sign-in (unconfirmed email auto-confirm) on the sign-in client', async () => {
    let attempt = 0
    h.createServiceRoleClient.mockImplementation(() => {
      const client = h.makeClient('service')
      client.auth.signInWithPassword.mockImplementation(async () => {
        attempt += 1
        client.__meta.signInCalls += 1
        if (attempt === 1) {
          return { data: { user: null, session: null }, error: { message: 'Email not confirmed', code: 'email_not_confirmed' } }
        }
        client.__meta.signedIn = true
        return { data: { user: USER, session: SESSION }, error: null }
      })
      client.rpc.mockResolvedValue({ data: USER.id, error: null })
      return client
    })

    const res = await loginPOST(loginRequest())
    expect(res.status).toBe(200)
    expect(attempt).toBe(2)

    const signInClients = h.state.clients.filter((c) => c.signInCalls > 0)
    expect(signInClients).toHaveLength(1)
    expect(signInClients[0].signInCalls).toBe(2)

    const profileClient = metaOf(h.ensureUserProfile.mock.calls[0][0])
    expect(profileClient.id).not.toBe(signInClients[0].id)
    expect(profileClient.signedIn).toBe(false)
    for (const call of usersWrites()) expect(call.signedIn).toBe(false)
  })
})

// ── Signup (Flow B: verification OFF) ───────────────────────────────────────

function signupRequest(refCode?: string) {
  return new NextRequest('http://localhost:3000/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Test Learner',
      email: USER.email,
      password: 'correct-horse',
      turnstileToken: 'tok',
      acceptedTerms: true,
      confirmedMinimumAge: true,
      ...(refCode ? { refCode } : {}),
    }),
  })
}

describe('POST /api/auth/signup (Flow B)', () => {
  it('creates the user, profile and referral on a client that never signs in; sign-in runs on its own client', async () => {
    h.isPlausibleReferralCode.mockReturnValue(true)

    const res = await signupPOST(signupRequest('REF123'))
    expect(res.status).toBe(200)
    expect((await res.json()).redirect).toBe('/dashboard')

    const signInClients = h.state.clients.filter((c) => c.signInCalls > 0)
    expect(signInClients).toHaveLength(1)
    expect(signInClients[0].signedIn).toBe(true)

    expect(h.ensureUserProfile).toHaveBeenCalledTimes(1)
    const profileClient = metaOf(h.ensureUserProfile.mock.calls[0][0])
    expect(profileClient.kind).toBe('service')
    expect(profileClient.id).not.toBe(signInClients[0].id)
    // No auth sign-in call ever reaches the service client that does the writes.
    expect(profileClient.signInCalls).toBe(0)
    expect(profileClient.signedIn).toBe(false)
    expect((h.ensureUserProfile.mock.calls[0][0] as FakeClient).auth.signInWithPassword).not.toHaveBeenCalled()

    expect(h.createReferralAttribution).toHaveBeenCalledTimes(1)
    expect(metaOf(h.createReferralAttribution.mock.calls[0][0]).id).toBe(profileClient.id)

    expect(usersWrites().length).toBeGreaterThan(0)
    for (const call of h.state.dbCalls.filter((c) => c.op !== 'select')) expect(call.signedIn).toBe(false)
  })

  it('still falls back to /login when the post-create sign-in fails, without touching the write client', async () => {
    h.state.signInResult = { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }

    const res = await signupPOST(signupRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).redirect).toBe('/login')

    const profileClient = metaOf(h.ensureUserProfile.mock.calls[0][0])
    expect(profileClient.signInCalls).toBe(0)
    expect(h.state.clients.filter((c) => c.signInCalls > 0).every((c) => c.id !== profileClient.id)).toBe(true)
  })
})

// ── Email callback (token_hash path) ────────────────────────────────────────

describe('GET /api/auth/callback token_hash path', () => {
  const callback = (query: string) => callbackGET(new NextRequest(`http://localhost:3000/api/auth/callback${query}`))

  it('signup confirmation: profile and referral go through a client that never verified', async () => {
    const res = await callback('?token_hash=th_signup&type=signup')
    expect(res.status).toBe(307)

    const verifyClients = h.state.clients.filter((c) => c.signInCalls > 0)
    expect(verifyClients).toHaveLength(1)
    expect(verifyClients[0].signedIn).toBe(true)

    const profileClient = metaOf(h.ensureUserProfile.mock.calls[0][0])
    const referralClient = metaOf(h.applyPendingReferral.mock.calls[0][0])
    expect(profileClient.kind).toBe('service')
    expect(profileClient.id).not.toBe(verifyClients[0].id)
    expect(profileClient.signedIn).toBe(false)
    expect(referralClient.id).toBe(profileClient.id)
    for (const call of usersWrites()) expect(call.signedIn).toBe(false)
  })

  it('email_change confirmation: the public.users email sync runs on the session-free client', async () => {
    h.state.verifyOtpResult = {
      data: { user: { ...USER, email: 'new@example.com' }, session: SESSION },
      error: null,
    }

    const res = await callback('?token_hash=th_change&type=email_change_new')
    expect(res.headers.get('location')).toContain('/email-verified')

    const verifyClient = h.state.clients.find((c) => c.signInCalls > 0)
    expect(verifyClient?.signedIn).toBe(true)

    const updates = usersWrites().filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].client).not.toBe(verifyClient?.id)
    expect(updates[0].signedIn).toBe(false)
    for (const call of usersWrites()) expect(call.signedIn).toBe(false)
  })

  it('recovery: verifies on the anon client and creates no service-role client at all', async () => {
    const res = await callback('?token_hash=th_reset&type=recovery&next=/reset-password')
    expect(res.status).toBe(307)

    expect(h.state.clients.map((c) => c.kind)).toEqual(['anon'])
    expect(h.createServiceRoleClient).not.toHaveBeenCalled()
    expect(h.ensureUserProfile).not.toHaveBeenCalled()
    expect(usersWrites()).toHaveLength(0)
  })
})

// ── Migration held in pending-approval ──────────────────────────────────────

const repoRoot = path.resolve(__dirname, '../../../..')
const migrationsDir = path.join(repoRoot, 'supabase/migrations')
const pendingDir = path.join(migrationsDir, 'pending-approval')
const NAME = '20261027000002_lock_public_users'
const read = (p: string) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const code = (sql: string) => sql.replace(/--.*$/gm, '')

describe(`migration ${NAME}`, () => {
  const forwardPath = path.join(pendingDir, `${NAME}.sql`)
  const rollbackPath = path.join(pendingDir, 'rollback', `${NAME}.down.sql`)
  const validationPath = path.join(pendingDir, 'validation', `${NAME}_validation.sql`)

  it('exists only under pending-approval, never in the auto-applied directories', () => {
    expect(fs.existsSync(forwardPath)).toBe(true)
    expect(fs.existsSync(rollbackPath)).toBe(true)
    expect(fs.existsSync(validationPath)).toBe(true)
    for (const dir of [migrationsDir, path.join(migrationsDir, 'rollback'), path.join(migrationsDir, 'validation')]) {
      expect(fs.readdirSync(dir).filter((f) => f.includes('20261027000002'))).toEqual([])
    }
  })

  it('revokes direct writes from anon and authenticated and drops the own-row write policies', () => {
    const sql = code(read(forwardPath))
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.users FROM PUBLIC, anon, authenticated;/)
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;')
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can update own profile" ON public.users;')
    expect(sql).not.toMatch(/\bGRANT\b[^;]*\b(anon|authenticated)\b/)
  })

  it('turns the column guard into an allow-list and keeps every existing check', () => {
    const sql = code(read(forwardPath))
    expect(sql).toContain("IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN")
    expect(sql).not.toContain("NOT IN ('authenticated', 'anon')")
    const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.guard_privileged_user_columns()')
    expect(fnStart).toBeGreaterThan(-1)
    expect(sql.slice(fnStart, sql.indexOf('AS $$', fnStart))).not.toMatch(/SECURITY DEFINER/i)
    const previous = code(read(path.join(migrationsDir, '20261020000001_guard_auth_provider_and_consent_columns.sql')))
    const checks = previous.match(/(NEW\.\w+ IS (DISTINCT FROM|NOT NULL)[^\n]*|coalesce\(NEW\.\w+, false\))/g) ?? []
    expect(checks.length).toBeGreaterThan(10)
    for (const check of checks) expect(sql).toContain(check)
  })

  it('self-checks the result with has_table_privilege in a DO block', () => {
    const sql = code(read(forwardPath))
    expect(sql).toMatch(/DO \$\$[\s\S]*has_table_privilege\(v_role, 'public\.users', 'INSERT, UPDATE, DELETE'\)[\s\S]*END \$\$;/)
    expect(sql).toContain("has_any_column_privilege(v_role, 'public.users', 'INSERT, UPDATE')")
    expect(sql).toContain("has_table_privilege('authenticated', 'public.users', 'SELECT')")
  })

  it('rollback restores the grants, the policies and the deny-list guard', () => {
    const sql = code(read(rollbackPath))
    expect(sql).toContain('GRANT INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;')
    expect(sql).toContain('CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);')
    expect(sql).toContain('CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);')
    expect(sql).toContain("IF current_user NOT IN ('authenticated', 'anon') THEN")
    expect(sql).toContain('CREATE TRIGGER trigger_guard_privileged_user_columns')
  })

  it('validation asserts privileges and rolls everything back', () => {
    const sql = read(validationPath)
    expect(sql).toMatch(/^BEGIN;$/m)
    expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
    for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toContain(`has_table_privilege(v_role, 'public.users', '${priv}')`)
    }
    expect(sql).toMatch(/SET LOCAL ROLE authenticated;/)
    expect(sql).toMatch(/SET LOCAL ROLE anon;/)
    expect(sql.match(/SET LOCAL ROLE/g)).toHaveLength(sql.match(/RESET ROLE;/g)?.length ?? 0)
  })

  it('new files carry no em-dashes', () => {
    for (const p of [forwardPath, rollbackPath, validationPath, __filename]) {
      expect(read(p)).not.toContain(String.fromCharCode(0x2014))
    }
  })
})
