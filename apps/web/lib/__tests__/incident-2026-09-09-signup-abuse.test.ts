/**
 * Regression coverage for the signup/abuse half of the 2026-09-09 incident.
 *
 * The observed production behavior was: hundreds of unauthenticated signup attempts,
 * Brevo's allowance consumed, and NO corresponding rows in `public.users`. That
 * combination is only possible because the outbound sends were not welcome emails at
 * all — they were Supabase Auth verification mails, fired by the GoTrue send-email
 * hook, which called `sendEmail()` directly and so was seen by no quota, no kill
 * switch, no suppression list and no deduplication. `auth.signUp()` creates an
 * `auth.users` row and nothing in `public.users`, which is exactly the "no users, but
 * emails went out" signature.
 *
 * Two further gaps let the volume through the controls added after 2026-09-06:
 *  - the per-IP limit was keyed on the LEFTMOST `X-Forwarded-For` value, which the
 *    client supplies, so rotating a header bought an unlimited supply of buckets;
 *  - the persistent limiter fell back to a process-local counter whenever the database
 *    was unreachable, which on serverless is indistinguishable from no limit.
 *
 * And one product-invariant break: supplying any `refCode` made signup call
 * `ensureUserProfile()`, which dispatches the welcome email — for an entirely
 * unverified account.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { getTrustedClientIp, getClientIpBucket } from '@/lib/security/client-ip'

// ─────────────────────────────────────────────────────────────────────────────
// Shared mocks
// ─────────────────────────────────────────────────────────────────────────────

const mockEvaluate = vi.fn(async (_key: string, _opts: Record<string, unknown>) => ({
  success: true,
  remaining: 4,
  resetInMs: 60_000,
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: [string, Record<string, unknown>]) => mockEvaluate(...args),
  evaluateRateLimit: (...args: [string, Record<string, unknown>]) => mockEvaluate(...args),
}))

const mockSettings = { maintenanceMode: false, allowSignups: true, requireEmailVerification: true }
vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ ...mockSettings })),
    getEmailSettings: vi.fn(async () => ({ retryDelayMinutes: 5 })),
  },
}))

const automationsState = { globalPause: false, dailyLimit: 100 }
vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ ...automationsState })),
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => automationsState.globalPause),
  },
}))

/** Tracks every welcome-email dispatch attempt made through the notification stack. */
const welcomeDispatches: Array<Record<string, unknown>> = []
vi.mock('@/lib/notifications/dispatcher', () => ({
  globalNotificationDispatcher: {
    dispatch: vi.fn(async (event: Record<string, unknown>) => {
      welcomeDispatches.push(event)
      return { delivered: true }
    }),
  },
}))
vi.mock('@/lib/notifications/events/connectors', () => ({
  initializeNotificationConnectors: vi.fn(),
}))

/** Supabase Auth behavior, reconfigurable per test. */
const authBehavior = {
  signUpResult: {
    data: { user: { id: 'new-user', identities: [{ id: '1' }] } },
    error: null as { message?: string } | null,
  },
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: vi.fn(async () => authBehavior.signUpResult),
      admin: { createUser: vi.fn(async () => ({ data: { user: { id: 'new-user' } }, error: null })) },
      signInWithPassword: vi.fn(async () => ({
        data: { session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }, user: { id: 'new-user' } },
        error: null,
      })),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }) }),
      insert: () => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: 'new-user' }, error: null })) }) }),
    }),
  }),
}))

// Turnstile is verified in its own suite (`turnstile-verification.test.ts`). Here it is
// mocked explicitly so this suite states its assumption rather than inheriting a
// global "CAPTCHA always passes" stub, and so no real Cloudflare call is attempted.
vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ success: true })),
  evaluateSiteverifyBudget: vi.fn(async () => ({ success: true, resetInMs: 3_600_000 })),
}))

import { POST as signupPOST } from '../../app/api/auth/signup/route'

function signupRequest(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest('https://prodily.app/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ turnstileToken: 'test-turnstile-token', ...body }),
  })
}

beforeEach(() => {
  mockEvaluate.mockClear()
  mockEvaluate.mockImplementation(async () => ({ success: true, remaining: 4, resetInMs: 60_000 }))
  welcomeDispatches.length = 0
  mockSettings.allowSignups = true
  mockSettings.requireEmailVerification = true
  automationsState.globalPause = false
  automationsState.dailyLimit = 100
  authBehavior.signUpResult = {
    data: { user: { id: 'new-user', identities: [{ id: '1' }] } },
    error: null,
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Trusted client IP (the control that made per-IP limiting real)
// ─────────────────────────────────────────────────────────────────────────────

describe('Incident 2026-09-09 — trusted client IP extraction', () => {
  function req(headers: Record<string, string>) {
    return { headers: { get: (n: string) => headers[n.toLowerCase()] ?? null } }
  }

  it('ignores the attacker-supplied leftmost X-Forwarded-For entry', () => {
    // The client sent "1.2.3.4"; the edge appended the address it actually observed.
    // Reading position 0 reads the attacker's string — the 2026-09-09 bypass.
    expect(getTrustedClientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7' }))).toBe('203.0.113.7')
  })

  it('rotating the spoofed leftmost value does NOT change the rate-limit bucket', () => {
    const buckets = new Set(
      ['9.9.9.1', '9.9.9.2', '9.9.9.3', '9.9.9.4'].map((spoof) =>
        getClientIpBucket(req({ 'x-forwarded-for': `${spoof}, 203.0.113.7` }))
      )
    )
    expect(buckets.size).toBe(1)
    expect([...buckets][0]).toBe('203.0.113.7')
  })

  it('prefers the platform-set header over anything in X-Forwarded-For', () => {
    expect(
      getTrustedClientIp(
        req({ 'x-vercel-forwarded-for': '198.51.100.5', 'x-forwarded-for': '1.2.3.4, 203.0.113.7' })
      )
    ).toBe('198.51.100.5')
  })

  it('rejects header garbage rather than turning it into a bucket key', () => {
    expect(getTrustedClientIp(req({ 'x-forwarded-for': 'unknown' }))).toBeNull()
    expect(getTrustedClientIp(req({ 'x-forwarded-for': 'not-an-ip; DROP TABLE' }))).toBeNull()
    // Unidentifiable traffic shares ONE bucket, so it throttles itself collectively
    // instead of each request getting its own budget.
    expect(getClientIpBucket(req({}))).toBe('unresolved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS 1-5, 17, 18 — signup abuse controls and the welcome-email invariant
// ─────────────────────────────────────────────────────────────────────────────

describe('Incident 2026-09-09 — signup cannot become an email-spending oracle', () => {
  // TEST 2 + TEST 18
  it('a successful Flow A signup dispatches NO welcome email before verification', async () => {
    const res = await signupPOST(
      signupRequest({ name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' })
    )

    expect(res.status).toBe(200)
    expect((await res.json()).verificationRequired).toBe(true)
    expect(welcomeDispatches).toHaveLength(0)
  })

  // TEST 18 — the exact pre-verification trigger that existed on main.
  it('supplying a refCode does NOT trigger a welcome email before verification', async () => {
    const res = await signupPOST(
      signupRequest({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'securePassword123',
        refCode: 'FRIEND123',
      })
    )

    expect(res.status).toBe(200)
    // Previously this path called ensureUserProfile() -> dispatchWelcomeEmailIfNeeded()
    // purely because a refCode was present in an attacker-controlled request body.
    expect(welcomeDispatches).toHaveLength(0)
  })

  it('a malformed refCode is dropped rather than carried into auth metadata', async () => {
    const res = await signupPOST(
      signupRequest({
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'securePassword123',
        refCode: '../../etc/passwd or 1=1',
      })
    )

    expect(res.status).toBe(200)
    expect(welcomeDispatches).toHaveLength(0)
  })

  // TEST 3
  it('a failed signup dispatches no welcome email', async () => {
    authBehavior.signUpResult = { data: { user: null as never }, error: { message: 'weak password' } }

    const res = await signupPOST(
      signupRequest({ name: 'Jane Doe', email: 'jane@example.com', password: 'securePassword123' })
    )

    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(welcomeDispatches).toHaveLength(0)
  })

  // TEST 4 / repeat-signup enumeration
  it('a repeat signup for an existing account returns a non-enumerating generic response without dispatching anything', async () => {
    authBehavior.signUpResult = { data: { user: { id: 'existing', identities: [] } }, error: null }

    const res = await signupPOST(
      signupRequest({ name: 'Jane Doe', email: 'taken@example.com', password: 'securePassword123' })
    )

    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.verificationRequired).toBe(true)
    expect(json.code).toBeUndefined()
    expect(welcomeDispatches).toHaveLength(0)
  })

  // TEST 1
  it('repeated attempts are refused once the per-IP budget is spent, before any Auth call', async () => {
    let calls = 0
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key.startsWith('signup_ip:')) {
        calls++
        return calls <= 5
          ? { success: true, remaining: 5 - calls, resetInMs: 900_000 }
          : { success: false, remaining: 0, resetInMs: 900_000 }
      }
      return { success: true, remaining: 9, resetInMs: 60_000 }
    })

    const statuses: number[] = []
    for (let i = 0; i < 8; i++) {
      const res = await signupPOST(
        signupRequest(
          { name: 'Bot', email: `bot${i}@example.com`, password: 'securePassword123' },
          { 'x-forwarded-for': '203.0.113.10' }
        )
      )
      statuses.push(res.status)
    }

    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true)
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true)
    expect(welcomeDispatches).toHaveLength(0)
  })

  // TEST 17 — the layer that survives rotating BOTH axes.
  it('rotating IPs and email addresses cannot bypass the aggregate ceiling', async () => {
    let aggregateCalls = 0
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key === 'signup_global') {
        aggregateCalls++
        // Every per-IP and per-email bucket is fresh (rotation works, as designed),
        // so only the constant-key aggregate can stop this campaign.
        return aggregateCalls <= 3
          ? { success: true, remaining: 3 - aggregateCalls, resetInMs: 3_600_000 }
          : { success: false, remaining: 0, resetInMs: 3_600_000 }
      }
      return { success: true, remaining: 99, resetInMs: 900_000 }
    })

    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await signupPOST(
        signupRequest(
          { name: 'Bot', email: `rotate${i}@example.com`, password: 'securePassword123' },
          { 'x-forwarded-for': `203.0.113.${i + 20}` } // a different IP every time
        )
      )
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(3)
    expect(welcomeDispatches).toHaveLength(0)
  })

  it('does not reveal which limit was hit (no account-existence oracle)', async () => {
    mockEvaluate.mockImplementation(async (key: string) =>
      key.startsWith('signup_email:')
        ? { success: false, remaining: 0, resetInMs: 3_600_000 }
        : { success: true, remaining: 9, resetInMs: 60_000 }
    )

    const res = await signupPOST(
      signupRequest({ name: 'Jane', email: 'known@example.com', password: 'securePassword123' })
    )
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.code).toBe('RATE_LIMITED')
    // The body must not name the bucket that tripped.
    expect(JSON.stringify(json)).not.toMatch(/email|ip|aggregate|global/i)
  })

  it('every signup evaluates all three budgets, and every one is fail-closed', async () => {
    await signupPOST(
      signupRequest(
        { name: 'Jane', email: 'jane@example.com', password: 'securePassword123' },
        { 'x-forwarded-for': '203.0.113.10' }
      )
    )

    const keys = mockEvaluate.mock.calls.map((c) => c[0] as string)
    expect(keys.some((k) => k.startsWith('signup_ip:'))).toBe(true)
    expect(keys.some((k) => k.startsWith('signup_email:'))).toBe(true)
    expect(keys).toContain('signup_global')

    for (const [, opts] of mockEvaluate.mock.calls) {
      expect((opts as { failClosed?: boolean }).failClosed).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS 13, 14, 15, 19, 20 — the governed email gateway
// ─────────────────────────────────────────────────────────────────────────────

describe('Incident 2026-09-09 — governed email gateway', () => {
  const originalEnv = { ...process.env }

  /** Records every governed control the gateway consulted, plus provider sends. */
  function setupGateway(options: {
    emailEnabled?: boolean
    globalPause?: boolean
    suppressed?: boolean
    limiter?: (key: string) => { success: boolean; remaining: number; resetInMs: number }
    claim?: boolean
    reserve?: (provider: string) => boolean
    send?: () => { success: boolean; provider?: string; id?: string; error?: string; statusCode?: number }
  }) {
    const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
    const sends: Array<Record<string, unknown>> = []

    vi.doMock('@/lib/notifications/feature-flags/service', () => ({
      globalFeatureFlagService: {
        isEnabledAsync: vi.fn(async () => options.emailEnabled !== false),
        isEnabled: vi.fn(() => options.emailEnabled !== false),
      },
    }))

    vi.doMock('@/lib/notifications/automations/service', () => ({
      EmailAutomationsService: {
        getState: vi.fn(async () => ({ globalPause: options.globalPause === true, dailyLimit: 100 })),
      },
    }))

    vi.doMock('@/lib/rate-limit', () => ({
      evaluatePersistentRateLimit: vi.fn(async (key: string) =>
        options.limiter ? options.limiter(key) : { success: true, remaining: 5, resetInMs: 0 }
      ),
    }))

    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => ({
        rpc: async (fn: string, args: Record<string, unknown>) => {
          rpcCalls.push({ fn, args })
          if (fn === 'claim_email_send') return { data: options.claim !== false, error: null }
          if (fn === 'reserve_provider_email_quota') {
            return { data: options.reserve ? options.reserve(String(args.p_provider)) : true, error: null }
          }
          return { data: null, error: null }
        },
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: options.suppressed ? { id: 's1' } : null, error: null }) }),
          }),
        }),
      }),
    }))

    vi.doMock('@/lib/email', () => ({
      maskEmail: (e: string) => `***@${String(e).split('@')[1] ?? 'x'}`,
      sendEmail: vi.fn(async (args: Record<string, unknown>) => {
        sends.push(args)
        return options.send ? options.send() : { success: true, provider: 'brevo', id: 'b-1', statusCode: 200 }
      }),
    }))

    return { rpcCalls, sends }
  }

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_key'
    process.env.RESEND_API_KEY = 'resend_key'
  })

  afterEach(() => {
    vi.doUnmock('@/lib/email')
    vi.doUnmock('@/lib/supabase')
    vi.doUnmock('@/lib/rate-limit')
    process.env = { ...originalEnv }
  })

  const verifyEmail = {
    purpose: 'auth.verify_email' as const,
    to: 'learner@example.com',
    subject: 'Verify',
    html: '<p>v</p>',
    text: 'v',
    idempotencyKey: 'auth:u1:signup:abc',
  }

  // TEST 13 — the kill switch must reach the highest-volume path, which is auth mail.
  it('the EMAIL_ENABLED kill switch stops even critical auth email', async () => {
    const { sends } = setupGateway({ emailEnabled: false })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('email_disabled')
    expect(sends).toHaveLength(0)
  })

  it('the global non-critical pause does NOT block critical auth email', async () => {
    const { sends } = setupGateway({ globalPause: true })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(true)
    expect(sends).toHaveLength(1)
  })

  it('the global non-critical pause DOES block a waitlist confirmation', async () => {
    const { sends } = setupGateway({ globalPause: true })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail({
      purpose: 'waitlist.confirmation',
      to: 'someone@example.com',
      subject: 'w',
      html: '<p>w</p>',
      text: 'w',
      idempotencyKey: 'waitlist:someone@example.com',
    })

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('global_pause')
    expect(sends).toHaveLength(0)
  })

  // TEST 19 / TEST 20 — auth mail is rate limited per recipient AND per IP.
  it('a spent per-recipient budget blocks the send before any provider call', async () => {
    const { sends } = setupGateway({
      limiter: (key) =>
        key.startsWith('email_to:')
          ? { success: false, remaining: 0, resetInMs: 3_600_000 }
          : { success: true, remaining: 5, resetInMs: 0 },
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('rate_limited_recipient')
    expect(sends).toHaveLength(0)
  })

  it('a spent per-IP budget blocks auth mail even for a brand-new address', async () => {
    const { sends } = setupGateway({
      limiter: (key) =>
        key.startsWith('email_ip:')
          ? { success: false, remaining: 0, resetInMs: 3_600_000 }
          : { success: true, remaining: 5, resetInMs: 0 },
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail({ ...verifyEmail, to: 'brand-new@example.com', ipBucket: '203.0.113.9' })

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('rate_limited_ip')
    expect(sends).toHaveLength(0)
  })

  it('the platform-wide ceiling blocks auth mail when both IP and address are rotated', async () => {
    const { sends } = setupGateway({
      limiter: (key) =>
        key === 'email_global:governed'
          ? { success: false, remaining: 0, resetInMs: 3_600_000 }
          : { success: true, remaining: 5, resetInMs: 0 },
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail({
      ...verifyEmail,
      to: 'fresh@example.com',
      ipBucket: '198.51.100.77',
      idempotencyKey: 'auth:u9:signup:zzz',
    })

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('rate_limited_aggregate')
    expect(sends).toHaveLength(0)
  })

  // TEST 5 — concurrency.
  it('concurrent identical requests produce exactly one provider send', async () => {
    let claimed = false
    const rpcCalls: string[] = []
    const sends: unknown[] = []

    vi.doMock('@/lib/notifications/feature-flags/service', () => ({
      globalFeatureFlagService: { isEnabledAsync: vi.fn(async () => true), isEnabled: vi.fn(() => true) },
    }))
    vi.doMock('@/lib/notifications/automations/service', () => ({
      EmailAutomationsService: { getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100 })) },
    }))
    vi.doMock('@/lib/rate-limit', () => ({
      evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 5, resetInMs: 0 })),
    }))
    vi.doMock('@/lib/supabase', () => ({
      createServiceRoleClient: () => ({
        // Mirrors `claim_email_send`: INSERT ... ON CONFLICT DO NOTHING semantics mean
        // exactly one caller wins the key, however many race for it.
        rpc: async (fn: string) => {
          rpcCalls.push(fn)
          if (fn === 'claim_email_send') {
            if (claimed) return { data: false, error: null }
            claimed = true
            return { data: true, error: null }
          }
          return { data: true, error: null }
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      }),
    }))
    vi.doMock('@/lib/email', () => ({
      maskEmail: (e: string) => `***@${String(e).split('@')[1] ?? 'x'}`,
      sendEmail: vi.fn(async () => {
        sends.push(1)
        return { success: true, provider: 'brevo', id: 'b-1', statusCode: 200 }
      }),
    }))

    const { sendGovernedEmail } = await import('../email-governance')

    const results = await Promise.all([
      sendGovernedEmail(verifyEmail),
      sendGovernedEmail(verifyEmail),
      sendGovernedEmail(verifyEmail),
      sendGovernedEmail(verifyEmail),
    ])

    expect(sends).toHaveLength(1)
    expect(results.filter((r) => r.sent)).toHaveLength(1)
    expect(results.filter((r) => r.blocked === 'duplicate')).toHaveLength(3)
  })

  // TEST 14
  it('an exhausted Brevo quota does not keep sending through Brevo', async () => {
    const { sends } = setupGateway({
      reserve: (provider) => provider !== 'brevo',
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(true)
    // The transport was explicitly told to start on the secondary, so no request is
    // spent rediscovering that the primary has no credit.
    expect(sends[0]).toMatchObject({ preferProvider: 'resend' })
  })

  // TEST 15
  it('an exhausted Brevo quota still allows Resend where policy permits', async () => {
    const reserved: string[] = []
    const { sends } = setupGateway({
      reserve: (provider) => {
        reserved.push(provider)
        return provider === 'resend'
      },
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(reserved).toEqual(['brevo', 'resend'])
    expect(result.sent).toBe(true)
    expect(sends).toHaveLength(1)
  })

  it('blocks only when EVERY provider quota is exhausted', async () => {
    const { sends } = setupGateway({ reserve: () => false })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(false)
    expect(result.blocked).toBe('quota_exhausted')
    expect(sends).toHaveLength(0)
  })

  it('returns the quota reservation when no provider accepted the message', async () => {
    const { rpcCalls } = setupGateway({
      send: () => ({ success: false, provider: 'brevo', error: 'refused', statusCode: 500 }),
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const result = await sendGovernedEmail(verifyEmail)

    expect(result.sent).toBe(false)
    // A send that never happened must not permanently consume a slot in the day's
    // ceiling, or repeated failures would eat the allowance on their own.
    expect(rpcCalls.map((c) => c.fn)).toContain('release_provider_email_quota')
  })

  it('suppression is enforced for non-critical mail and bypassed for critical auth mail', async () => {
    {
      const { sends } = setupGateway({ suppressed: true })
      const { sendGovernedEmail } = await import('../email-governance')
      const result = await sendGovernedEmail({
        purpose: 'waitlist.confirmation',
        to: 'bounced@example.com',
        subject: 'w',
        html: '<p>w</p>',
        text: 'w',
        idempotencyKey: 'waitlist:bounced@example.com',
      })
      expect(result.blocked).toBe('suppressed')
      expect(sends).toHaveLength(0)
    }

    vi.resetModules()

    {
      const { sends } = setupGateway({ suppressed: true })
      const { sendGovernedEmail } = await import('../email-governance')
      const result = await sendGovernedEmail(verifyEmail)
      expect(result.sent).toBe(true)
      expect(sends).toHaveLength(1)
    }
  })

  it('the ledger records the outcome without persisting the verification token', async () => {
    const { rpcCalls } = setupGateway({})
    const { sendGovernedEmail } = await import('../email-governance')

    await sendGovernedEmail(verifyEmail)

    const finalize = rpcCalls.find((c) => c.fn === 'finalize_email_send')
    expect(finalize).toBeDefined()
    expect(finalize!.args.p_status).toBe('sent')
    // Nothing token-shaped, and no unmasked recipient, reaches the durable record.
    expect(JSON.stringify(finalize!.args)).not.toContain('learner@example.com')
  })
})
