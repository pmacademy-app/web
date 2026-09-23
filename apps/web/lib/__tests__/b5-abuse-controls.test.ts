import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Shared Mocks & State ───────────────────────────────────────────────────────
const mockEvaluateRateLimit = vi.fn()

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: unknown[]) => mockEvaluateRateLimit(...args),
  evaluateRateLimit: (...args: unknown[]) => mockEvaluateRateLimit(...args),
  evaluateInMemoryRateLimit: vi.fn(),
}))

const mockSettings = {
  isEmailVerificationRequired: vi.fn().mockResolvedValue(true),
  getProductSettings: vi.fn().mockResolvedValue({
    allowSignups: true,
    requireEmailVerification: true,
  }),
}

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    isEmailVerificationRequired: () => mockSettings.isEmailVerificationRequired(),
    getProductSettings: () => mockSettings.getProductSettings(),
  },
}))

const mockSupabase = {
  auth: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    updateUser: vi.fn(),
    admin: {
      listUsers: vi.fn(),
      updateUserById: vi.fn(),
      createUser: vi.fn(),
    },
  },
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => mockSupabase,
  createAuthenticatedServerClient: () => mockSupabase,
}))

vi.mock('@/lib/auth', () => ({
  ensureUserProfile: vi.fn().mockResolvedValue({ id: 'usr-1' }),
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn().mockResolvedValue({ dailyLimit: 100 }),
  },
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn().mockResolvedValue('err_12345'),
  logErrorReport: vi.fn().mockResolvedValue(undefined),
}))

const mockVerifyTurnstileToken = vi.fn()
const mockEvaluateSiteverifyBudget = vi.fn()
vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: (...args: unknown[]) => mockVerifyTurnstileToken(...args),
  evaluateSiteverifyBudget: (...args: unknown[]) => mockEvaluateSiteverifyBudget(...args),
}))

const mockCreateReferralAttribution = vi.fn()
vi.mock('@/lib/referral/referral-service', () => ({
  createReferralAttribution: (...args: unknown[]) => mockCreateReferralAttribution(...args),
  isPlausibleReferralCode: (code: unknown) => typeof code === 'string' && code.length >= 3,
}))

// Import route handlers under test
import { POST as loginPOST } from '@/app/api/auth/login/route'
import { POST as updatePasswordPOST } from '@/app/api/auth/update-password/route'
import { POST as telemetryPOST } from '@/app/api/auth/telemetry/route'
import { POST as signupPOST } from '@/app/api/auth/signup/route'

function createRequest(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
  cookies: Record<string, string> = {}
): NextRequest {
  const req = new NextRequest(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  for (const [key, value] of Object.entries(cookies)) {
    req.cookies.set(key, value)
  }
  return req
}

describe('Batch B5 — Abuse Controls & Atomic Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEvaluateRateLimit.mockResolvedValue({ success: true, remaining: 9, resetInMs: 60000 })
    mockSupabase.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'usr-1', email: 'test@example.com', email_confirmed_at: '2026-01-01' },
        session: { access_token: 'valid_access_token', refresh_token: 'valid_refresh', expires_in: 3600 },
      },
      error: null,
    })
    mockSupabase.auth.updateUser.mockResolvedValue({
      data: { user: { id: 'usr-1' } },
      error: null,
    })
    mockVerifyTurnstileToken.mockResolvedValue({ success: true })
    mockEvaluateSiteverifyBudget.mockResolvedValue({ success: true, resetInMs: 3_600_000 })
    mockCreateReferralAttribution.mockResolvedValue({ success: true })
  })

  // ============================================================================
  // 1. POST /api/auth/login Rate Limiting
  // ============================================================================
  describe('1. Login Rate Limiting (POST /api/auth/login)', () => {
    it('permits login requests below limits and establishes session', async () => {
      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'learner@example.com',
        password: 'validPassword123',
      }, { 'x-real-ip': '203.0.113.10' })

      const res = await loginPOST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith('login_ip:203.0.113.10', expect.objectContaining({ limit: 10, failClosed: true }))
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith('login_email:learner@example.com', expect.objectContaining({ limit: 5, failClosed: true }))
    })

    it('blocks login requests when IP rate limit is exceeded', async () => {
      mockEvaluateRateLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('login_ip:')) {
          return { success: false, remaining: 0, resetInMs: 300000 }
        }
        return { success: true, remaining: 4, resetInMs: 300000 }
      })

      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'learner@example.com',
        password: 'validPassword123',
      }, { 'x-real-ip': '203.0.113.10' })

      const res = await loginPOST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.code).toBe('AUTH_RATE_LIMITED')
      expect(data.error).toBe('Too many login attempts. Please wait a while before trying again.')
      expect(data.resetInMs).toBe(300000)
      // Supabase signInWithPassword must NOT be invoked when rate limited
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    it('blocks login requests when email rate limit is exceeded, even if attacker rotates IPs', async () => {
      mockEvaluateRateLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('login_email:victim@example.com')) {
          return { success: false, remaining: 0, resetInMs: 450000 }
        }
        return { success: true, remaining: 9, resetInMs: 450000 }
      })

      // Attacker uses rotated IP
      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'victim@example.com',
        password: 'wrongPassword',
      }, { 'x-real-ip': '198.51.100.99' })

      const res = await loginPOST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.code).toBe('AUTH_RATE_LIMITED')
      expect(data.resetInMs).toBe(450000)
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    it('canonicalizes Gmail +tag aliases for email rate limit bucket', async () => {
      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'Learner+SpamTest@Gmail.com',
        password: 'validPassword123',
      })

      await loginPOST(req)
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith(
        'login_email:learner@gmail.com',
        expect.objectContaining({ limit: 5, failClosed: true })
      )
    })

    it('fails closed when persistent rate limiter is unavailable or throws', async () => {
      mockEvaluateRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 900000 })

      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'learner@example.com',
        password: 'validPassword123',
      })

      const res = await loginPOST(req)
      expect(res.status).toBe(429)
      expect(mockSupabase.auth.signInWithPassword).not.toHaveBeenCalled()
    })

    it('uses trusted client IP and ignores spoofed leftmost X-Forwarded-For', async () => {
      const req = createRequest('https://prodily.app/api/auth/login', {
        email: 'learner@example.com',
        password: 'validPassword123',
      }, {
        'x-forwarded-for': '1.2.3.4, 203.0.113.88',
      })

      await loginPOST(req)
      // Rightmost hop 203.0.113.88 is trusted, not spoofed 1.2.3.4
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith('login_ip:203.0.113.88', expect.any(Object))
    })

    it('provides non-enumerating error responses (identical error copy whether IP or email hit limit)', async () => {
      mockEvaluateRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, resetInMs: 60000 })
      const resIp = await loginPOST(createRequest('https://prodily.app/api/auth/login', {
        email: 'foo@example.com',
        password: 'pwd',
      }))
      const bodyIp = await resIp.json()

      mockEvaluateRateLimit.mockResolvedValueOnce({ success: true, remaining: 9, resetInMs: 60000 })
      mockEvaluateRateLimit.mockResolvedValueOnce({ success: false, remaining: 0, resetInMs: 60000 })
      const resEmail = await loginPOST(createRequest('https://prodily.app/api/auth/login', {
        email: 'bar@example.com',
        password: 'pwd',
      }))
      const bodyEmail = await resEmail.json()

      expect(bodyIp.error).toBe(bodyEmail.error)
      expect(bodyIp.code).toBe(bodyEmail.code)
      expect(bodyIp.error).toBe('Too many login attempts. Please wait a while before trying again.')
    })
  })

  // ============================================================================
  // 2. POST /api/auth/update-password Rate Limiting
  // ============================================================================
  describe('2. Update-Password Rate Limiting (POST /api/auth/update-password)', () => {
    const validToken = 'header.' + Buffer.from(JSON.stringify({ sub: 'usr-test-99' })).toString('base64url') + '.sig'

    it('permits authenticated password updates below limit', async () => {
      const req = createRequest(
        'https://prodily.app/api/auth/update-password',
        { newPassword: 'newSecretPassword123' },
        { Authorization: `Bearer ${validToken}`, 'x-real-ip': '203.0.113.55' }
      )

      const res = await updatePasswordPOST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith('update_pwd_ip:203.0.113.55', expect.objectContaining({ limit: 10, failClosed: true }))
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith('update_pwd_user:user:usr-test-99', expect.objectContaining({ limit: 5, failClosed: true }))
      expect(mockSupabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newSecretPassword123' })
    })

    it('rejects unauthenticated requests before consuming rate limit budget', async () => {
      const req = createRequest('https://prodily.app/api/auth/update-password', {
        newPassword: 'newSecretPassword123',
      })

      const res = await updatePasswordPOST(req)
      expect(res.status).toBe(401)
      // Rate limiter must NOT have been called for an unauthenticated request
      expect(mockEvaluateRateLimit).not.toHaveBeenCalled()
    })

    it('blocks authenticated requests when rate limit is exceeded', async () => {
      mockEvaluateRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 120000 })

      const req = createRequest(
        'https://prodily.app/api/auth/update-password',
        { newPassword: 'newSecretPassword123' },
        { Authorization: `Bearer ${validToken}` }
      )

      const res = await updatePasswordPOST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.code).toBe('AUTH_RATE_LIMITED')
      expect(data.error).toBe('Too many password update attempts. Please wait a while before trying again.')
      expect(mockSupabase.auth.updateUser).not.toHaveBeenCalled()
    })

    it('isolates user rate limits (User A exhausted does not block User B)', async () => {
      const userAToken = 'header.' + Buffer.from(JSON.stringify({ sub: 'user-a' })).toString('base64url') + '.sig'
      const userBToken = 'header.' + Buffer.from(JSON.stringify({ sub: 'user-b' })).toString('base64url') + '.sig'

      mockEvaluateRateLimit.mockImplementation(async (key: string) => {
        if (key === 'update_pwd_user:user:user-a') {
          return { success: false, remaining: 0, resetInMs: 60000 }
        }
        return { success: true, remaining: 4, resetInMs: 60000 }
      })

      // User A blocked
      const resA = await updatePasswordPOST(createRequest(
        'https://prodily.app/api/auth/update-password',
        { newPassword: 'pwd123456' },
        { Authorization: `Bearer ${userAToken}` }
      ))
      expect(resA.status).toBe(429)

      // User B succeeds
      const resB = await updatePasswordPOST(createRequest(
        'https://prodily.app/api/auth/update-password',
        { newPassword: 'pwd123456' },
        { Authorization: `Bearer ${userBToken}` }
      ))
      expect(resB.status).toBe(200)
    })
  })

  // ============================================================================
  // 3. Telemetry Client-IP Hardening
  // ============================================================================
  describe('3. Telemetry Client-IP Hardening (POST /api/auth/telemetry)', () => {
    it('ignores spoofed leftmost XFF and evaluates client-IP via canonical helper', async () => {
      const req = new Request('https://prodily.app/api/auth/telemetry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': 'spoofed.evil.attacker.ip, 198.51.100.42',
        },
        body: JSON.stringify({
          errorCode: 'AUTH_INVALID_CREDENTIALS',
          authAction: 'login',
        }),
      })

      const res = await telemetryPOST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })

    it('handles malformed forwarded headers by safely resolving to fallback bucket', async () => {
      const req = new Request('https://prodily.app/api/auth/telemetry', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': 'totally-invalid-ip; DROP TABLE',
        },
        body: JSON.stringify({
          errorCode: 'AUTH_RATE_LIMITED',
          authAction: 'login',
        }),
      })

      const res = await telemetryPOST(req)
      expect(res.status).toBe(200)
    })
  })

  // ============================================================================
  // 4. Close Signup Account Enumeration
  // ============================================================================
  describe('4. Signup Account Enumeration Protection', () => {
    it('returns a generic non-enumerating 200 response when email is already registered', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'existing-user-id', identities: [] } },
        error: null,
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Existing User',
        email: 'registered@example.com',
        password: 'securePassword123',
        turnstileToken: 'valid-turnstile-token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      const data = await res.json()

      // Must be 200 OK, not 409 Conflict
      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.verificationRequired).toBe(true)
      expect(data.email).toBe('registered@example.com')
      expect(data.code).toBeUndefined()
      expect(data.error).toBeUndefined()
    })

    it('returns the identical 200 contract for a brand new email', async () => {
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'new-user-id', identities: [{ id: 'ident-1' }] } },
        error: null,
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'New User',
        email: 'fresh@example.com',
        password: 'securePassword123',
        turnstileToken: 'valid-turnstile-token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.verificationRequired).toBe(true)
      expect(data.email).toBe('fresh@example.com')
    })

    it('never creates app profiles or dispatches attribution for existing account signups', async () => {
      const { ensureUserProfile } = await import('@/lib/auth')
      mockSupabase.auth.signUp.mockResolvedValue({
        data: { user: { id: 'existing-user-id', identities: [] } },
        error: null,
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Attacker Attempt',
        email: 'registered@example.com',
        password: 'securePassword123',
        refCode: 'REF123',
        turnstileToken: 'valid-turnstile-token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      await signupPOST(req)
      // Must NOT create profile or grant referral
      expect(ensureUserProfile).not.toHaveBeenCalled()
    })
  })

  // ============================================================================
  // 5. Turnstile Bot Challenge & Side-Effect Safety
  // ============================================================================
  describe('5. Turnstile Bot Challenge & Side-Effect Safety', () => {
    it('11. rejects signup when turnstileToken is missing from request body', async () => {
      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Bot Attempt',
        email: 'bot@example.com',
        password: 'password123',
      })

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe('VALIDATION')
      expect(mockVerifyTurnstileToken).not.toHaveBeenCalled()
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
    })

    it('12. rejects signup with CAPTCHA_FAILED when Turnstile verification fails', async () => {
      mockVerifyTurnstileToken.mockResolvedValueOnce({
        success: false,
        code: 'CAPTCHA_FAILED',
        errorCodes: ['invalid-input-response'],
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Bot Attempt',
        email: 'bot@example.com',
        password: 'password123',
        turnstileToken: 'invalid_token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(400)
      expect(data.code).toBe('CAPTCHA_FAILED')
      expect(data.error).toBe('Security verification failed. Please try again.')
    })

    it('13. fails closed with CAPTCHA_UNAVAILABLE when Cloudflare is down or timed out', async () => {
      mockVerifyTurnstileToken.mockResolvedValueOnce({
        success: false,
        code: 'CAPTCHA_UNAVAILABLE',
        isTimeout: true,
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'User Attempt',
        email: 'learner@example.com',
        password: 'password123',
        turnstileToken: 'token_during_outage',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(503)
      expect(data.code).toBe('CAPTCHA_UNAVAILABLE')
    })

    it('14-17. guarantees zero side effects on failed Turnstile (no auth, no profile, no referral, no rate limit burn)', async () => {
      const { ensureUserProfile } = await import('@/lib/auth')
      mockVerifyTurnstileToken.mockResolvedValueOnce({
        success: false,
        code: 'CAPTCHA_FAILED',
      })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Targeted Victim Lockout Attempt',
        email: 'victim@example.com',
        password: 'securePassword123',
        refCode: 'REF999',
        turnstileToken: 'forged_bad_token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      expect(res.status).toBe(400)

      // Invariant checks:
      // 1. No Supabase Auth signup call
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
      // 2. No user profile created
      expect(ensureUserProfile).not.toHaveBeenCalled()
      // 3. No referral attribution
      expect(mockCreateReferralAttribution).not.toHaveBeenCalled()
      // 4. Phase 2 email and global rate limits are NEVER touched
      expect(mockEvaluateRateLimit).not.toHaveBeenCalledWith(
        expect.stringContaining('signup_email:victim@example.com'),
        expect.anything()
      )
      expect(mockEvaluateRateLimit).not.toHaveBeenCalledWith(
        'signup_global',
        expect.anything()
      )
    })

    it('19. platform-wide Siteverify budget is consumed before Cloudflare is contacted', async () => {
      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Normal Learner',
        email: 'learner@example.com',
        password: 'securePassword123',
        turnstileToken: 'valid-turnstile-token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      await signupPOST(req)

      expect(mockEvaluateSiteverifyBudget).toHaveBeenCalled()
      expect(mockVerifyTurnstileToken).toHaveBeenCalled()
    })

    it('20. an exhausted Siteverify budget refuses without contacting Cloudflare or spending signup budget', async () => {
      // A distributed campaign cannot be stopped by the per-IP limiter, because every
      // rotated address buys a fresh budget. This constant-key ceiling is what bounds
      // the outbound calls, and it must refuse BEFORE the invocation-holding fetch.
      mockEvaluateSiteverifyBudget.mockResolvedValueOnce({ success: false, resetInMs: 1_800_000 })

      const req = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Distributed Flooder',
        email: 'victim@example.com',
        password: 'securePassword123',
        turnstileToken: 'any_token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.code).toBe('RATE_LIMITED')
      expect(mockVerifyTurnstileToken).not.toHaveBeenCalled()
      expect(mockSupabase.auth.signUp).not.toHaveBeenCalled()
      // The victim's per-email allowance and the platform signup ceiling stay untouched.
      expect(mockEvaluateRateLimit).not.toHaveBeenCalledWith(
        expect.stringContaining('signup_email:'),
        expect.anything()
      )
      expect(mockEvaluateRateLimit).not.toHaveBeenCalledWith('signup_global', expect.anything())
    })

    it('21. Cloudflare receives the trusted client IP, never the `unresolved` bucket sentinel', async () => {
      const resolved = createRequest(
        'https://prodily.app/api/auth/signup',
        {
          name: 'Resolved IP',
          email: 'resolved@example.com',
          password: 'securePassword123',
          turnstileToken: 'valid-turnstile-token',
          acceptedTerms: true,
          confirmedMinimumAge: true,
        },
        { 'x-real-ip': '203.0.113.55' }
      )
      await signupPOST(resolved)
      expect(mockVerifyTurnstileToken).toHaveBeenLastCalledWith('valid-turnstile-token', '203.0.113.55')

      mockVerifyTurnstileToken.mockClear()

      // No trusted header at all: the rate limiter still buckets under `unresolved`,
      // but Cloudflare must be given `undefined` rather than that sentinel string.
      const unresolved = createRequest('https://prodily.app/api/auth/signup', {
        name: 'Unresolved IP',
        email: 'unresolved@example.com',
        password: 'securePassword123',
        turnstileToken: 'valid-turnstile-token',
        acceptedTerms: true,
        confirmedMinimumAge: true,
      })
      await signupPOST(unresolved)
      expect(mockVerifyTurnstileToken).toHaveBeenLastCalledWith('valid-turnstile-token', undefined)
      expect(mockEvaluateRateLimit).toHaveBeenCalledWith(
        'signup_ip:unresolved',
        expect.anything()
      )
    })

    it('18. Phase 1 IP rate limit executes before Turnstile and halts single-IP flood', async () => {
      mockEvaluateRateLimit.mockImplementation(async (key: string) => {
        if (key.startsWith('signup_ip:')) {
          return { success: false, remaining: 0, resetInMs: 900000 }
        }
        return { success: true, remaining: 5, resetInMs: 60000 }
      })

      const req = createRequest(
        'https://prodily.app/api/auth/signup',
        {
          name: 'IP Flooder',
          email: 'flooder@example.com',
          password: 'password123',
          turnstileToken: 'any_token',
          acceptedTerms: true,
          confirmedMinimumAge: true,
        },
        { 'x-real-ip': '198.51.100.77' }
      )

      const res = await signupPOST(req)
      const data = await res.json()

      expect(res.status).toBe(429)
      expect(data.code).toBe('RATE_LIMITED')
      // Turnstile must NOT be invoked if IP rate limit fails
      expect(mockVerifyTurnstileToken).not.toHaveBeenCalled()
    })
  })
})
