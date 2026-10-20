/**
 * SEC-17: when GoTrue refuses a signup for a reason other than "already registered", the
 * signup route must not forward the provider message or code to the client. The raw text
 * (for example "Database error saving new user: relation x ...") leaks database internals.
 * Flow B logs it server-side through logSystemError and returns the auth classifier's
 * static copy, the same contract Flow A uses.
 *
 * Both flows must also recognise GoTrue's real duplicate-email answer from
 * `admin.createUser` ("A user with this email address has already been registered",
 * code `email_exists`, HTTP 422) and take the non-enumerating success path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCreateUser = vi.fn()
const mockSignUp = vi.fn()
const mockLogSystemError = vi.fn<(opts: Record<string, unknown>) => Promise<null>>(async () => null)
const mockSettings = { maintenanceMode: false, allowSignups: true, requireEmailVerification: false }

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 4, resetInMs: 60_000 })),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ ...mockSettings })),
  },
}))

vi.mock('@/lib/monitoring/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/monitoring/logger')>()
  return {
    ...actual,
    logSystemError: (opts: Record<string, unknown>) => mockLogSystemError(opts),
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      admin: { createUser: (...args: unknown[]) => mockCreateUser(...args) },
      signInWithPassword: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }) }),
      insert: () => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: 'new-user' }, error: null })) }) }),
    }),
  }),
}))

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ success: true })),
  evaluateSiteverifyBudget: vi.fn(async () => ({ success: true, resetInMs: 3_600_000 })),
}))

import { POST as signupPOST } from '../../app/api/auth/signup/route'

/** GoTrue's actual admin.createUser answer for a duplicate email. */
const GOTRUE_EMAIL_EXISTS = {
  message: 'A user with this email address has already been registered',
  code: 'email_exists',
  status: 422,
}

function makeRequest() {
  return new NextRequest('https://prodily.app/api/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.20' },
    body: JSON.stringify({
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'securePassword123',
      turnstileToken: 'test-turnstile-token',
      acceptedTerms: true,
      confirmedMinimumAge: true,
    }),
  })
}

describe('POST /api/auth/signup Flow B (verification OFF)', () => {
  beforeEach(() => {
    mockSettings.requireEmailVerification = false
    mockCreateUser.mockReset()
    mockSignUp.mockReset()
    mockLogSystemError.mockClear()
  })

  it('returns classified copy for a database failure and never forwards the provider text', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Database error saving new user: relation x', code: 'unexpected_failure' },
    })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
    expect(json.error).not.toMatch(/Database/i)
    expect(json.error).not.toMatch(/relation/i)
    expect(JSON.stringify(json)).not.toContain('unexpected_failure')
  })

  it('returns the generic unknown-error copy for an unrecognised provider message', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'relation "public.secret_table" violates constraint users_pkey', code: 'unexpected_failure' },
    })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.code).toBe('AUTH_UNKNOWN_ERROR')
    expect(json.error).toBe('An unexpected authentication error occurred. Please try again.')
    expect(JSON.stringify(json)).not.toMatch(/secret_table|users_pkey|relation|unexpected_failure/)
  })

  it('logs the raw provider message server-side', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Database error saving new user: relation x', code: 'unexpected_failure' },
    })

    await signupPOST(makeRequest())

    expect(mockLogSystemError).toHaveBeenCalledTimes(1)
    expect(mockLogSystemError.mock.calls[0][0]).toMatchObject({
      severity: 'error',
      category: 'auth',
      operation: 'signup_create_user',
      message: 'Database error saving new user: relation x',
    })
  })

  it("takes the non-enumerating 200 path for GoTrue's real email_exists answer", async () => {
    mockCreateUser.mockResolvedValue({ data: { user: null }, error: { ...GOTRUE_EMAIL_EXISTS } })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, verificationRequired: false, redirect: '/login' })
    expect(JSON.stringify(json)).not.toMatch(/already/i)
    expect(mockLogSystemError).not.toHaveBeenCalled()
  })

  it('treats the email_exists code as existing even when the wording changes', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Conflict', code: 'email_exists', status: 422 },
    })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).redirect).toBe('/login')
  })

  it('still recognises the legacy "User already registered" wording', async () => {
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'User already registered', code: 'user_already_exists' },
    })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).redirect).toBe('/login')
  })
})

describe('POST /api/auth/signup Flow A (verification ON)', () => {
  beforeEach(() => {
    mockSettings.requireEmailVerification = true
    mockCreateUser.mockReset()
    mockSignUp.mockReset()
    mockLogSystemError.mockClear()
  })

  it("takes the non-enumerating 200 path for GoTrue's real email_exists answer", async () => {
    mockSignUp.mockResolvedValue({ data: { user: null, session: null }, error: { ...GOTRUE_EMAIL_EXISTS } })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toMatchObject({ success: true, verificationRequired: true, email: 'jane@example.com' })
    expect(JSON.stringify(json)).not.toMatch(/already/i)
  })

  it('treats the user_already_exists code as existing even when the wording changes', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Conflict', code: 'user_already_exists', status: 422 },
    })

    const res = await signupPOST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).verificationRequired).toBe(true)
  })
})
