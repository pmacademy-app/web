/**
 * Route-level coverage that the P7 contract holds at the real endpoints (audit B19).
 *
 * Two cases per route: a KNOWN classified failure (provider/auth error) and an
 * UNEXPECTED exception. Neither may put exception, provider, or database text in the
 * response body.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 4, resetInMs: 60_000 })),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 4, resetInMs: 60_000 })),
}))

const productSettings = { maintenanceMode: false, allowSignups: true, requireEmailVerification: true }
vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ ...productSettings })),
    isEmailVerificationRequired: vi.fn(async () => true),
  },
}))

vi.mock('@/lib/auth', () => ({
  ensureUserProfile: vi.fn(async () => undefined),
  getAuthenticatedUserFromRequest: vi.fn(async () => null),
}))

/** Swapped per test to drive the auth outcome. */
let signUpImpl: () => Promise<unknown> = async () => ({
  data: { user: { id: 'u1', identities: [{ id: '1' }] } },
  error: null,
})
let signInImpl: () => Promise<unknown> = async () => ({
  data: { session: { access_token: 't', refresh_token: 'r', expires_in: 3600 }, user: { id: 'u1' } },
  error: null,
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: () => signUpImpl(),
      signInWithPassword: () => signInImpl(),
      admin: { createUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }) }),
      insert: () => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: 'u1' }, error: null })) }) }),
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

import { POST as loginPOST } from '../../app/api/auth/login/route'
import { POST as signupPOST } from '../../app/api/auth/signup/route'

function req(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

/** Things that must never appear in a client-facing error body. */
function assertNoLeak(serialized: string) {
  expect(serialized).not.toContain('ECONNREFUSED')
  expect(serialized).not.toContain('relation "users"')
  expect(serialized).not.toContain('xkeysib-')
  expect(serialized).not.toContain('gotrue')
  expect(serialized).not.toMatch(/at\s+\w+\s+\(/) // stack frame
}

beforeEach(() => {
  vi.clearAllMocks()
  productSettings.allowSignups = true
  signUpImpl = async () => ({ data: { user: { id: 'u1', identities: [{ id: '1' }] } }, error: null })
  signInImpl = async () => ({
    data: { session: { access_token: 't', refresh_token: 'r', expires_in: 3600 }, user: { id: 'u1' } },
    error: null,
  })
})

describe('POST /api/auth/login — error contract', () => {
  it('returns safe copy, a code and an errorId when an unexpected exception is thrown', async () => {
    signInImpl = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432 relation "users" does not exist')
    }

    const res = await loginPOST(req('https://prodily.app/api/auth/login', {
      email: 'learner@example.com',
      password: 'hunter2222',
    }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.code).toBe('SERVER_ERROR')
    expect(typeof body.error).toBe('string')
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    assertNoLeak(JSON.stringify(body))
  })

  it('keeps validation failures on their existing 400 contract', async () => {
    const res = await loginPOST(req('https://prodily.app/api/auth/login', { email: 'nope', password: '' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION')
    expect(typeof body.error).toBe('string')
  })
})

describe('POST /api/auth/signup — error contract', () => {
  const validBody = {
    name: 'Test Learner',
    email: 'learner@example.com',
    password: 'hunter2222',
    confirmPassword: 'hunter2222',
    turnstileToken: 'test-turnstile-token',
  }

  it('classifies a provider error instead of forwarding its message', async () => {
    signUpImpl = async () => ({
      data: { user: null },
      error: Object.assign(new Error('Password should be at least 6 characters. [gotrue:422]'), {
        code: 'weak_password',
      }),
    })

    const res = await signupPOST(req('https://prodily.app/api/auth/signup', validBody))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('AUTH_PASSWORD_TOO_WEAK')
    expect(body.error).not.toContain('gotrue')
    assertNoLeak(JSON.stringify(body))
  })

  it('returns safe copy, a code and an errorId on an unexpected exception', async () => {
    signUpImpl = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:5432')
    }

    const res = await signupPOST(req('https://prodily.app/api/auth/signup', validBody))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.code).toBe('SERVER_ERROR')
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    assertNoLeak(JSON.stringify(body))
  })

  it('preserves the existing SIGNUPS_DISABLED contract the signup page branches on', async () => {
    productSettings.allowSignups = false

    const res = await signupPOST(req('https://prodily.app/api/auth/signup', validBody))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('SIGNUPS_DISABLED')
    expect(typeof body.error).toBe('string')
  })

  it('returns a non-enumerating response when the email already exists instead of leaking USER_EXISTS', async () => {
    signUpImpl = async () => ({
      data: { user: { id: 'u1', identities: [] } },
      error: null,
    })

    const res = await signupPOST(req('https://prodily.app/api/auth/signup', validBody))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.verificationRequired).toBe(true)
    expect(body.code).toBeUndefined()
    expect(body.error).toBeUndefined()
  })
})
