/**
 * Security tests for the Change Email endpoint (Settings → Security).
 *
 * Verifies:
 * 1. Auth required.
 * 2. Input validation (email format, same-as-current, current password required).
 * 3. Rate limiting gates the request before any auth-mutating call.
 * 4. Current-password re-authentication is required before initiating a change.
 * 5. Duplicate email (already used by another account) is rejected server-side.
 * 6. On success, Supabase Auth's native `updateUser({ email })` is called on a
 *    SESSION-hydrated client (not the service-role client) with an
 *    `emailRedirectTo` pointing back at Settings → Security — reusing the
 *    existing native flow rather than a custom OTP system.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock(...) factories are hoisted above all imports and top-level `const`
// declarations, so any mock fn they reference must come from vi.hoisted().
const {
  mockCookieGet,
  mockSignInWithPassword,
  mockUsersIlikeMaybeSingle,
  mockSetSession,
  mockUpdateUser,
  mockEvaluateRateLimit,
} = vi.hoisted(() => ({
  mockCookieGet: vi.fn(),
  mockSignInWithPassword: vi.fn(),
  mockUsersIlikeMaybeSingle: vi.fn(),
  mockSetSession: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockEvaluateRateLimit: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  })),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          maybeSingle: mockUsersIlikeMaybeSingle,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluateRateLimit: mockEvaluateRateLimit,
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(),
}))

import { POST, GET } from '../../app/api/settings/security/change-email/route'
import * as authLib from '../auth'

const mockUser = { id: 'usr_test_123', email: 'learner@example.com' }

function makeRequest(body: Record<string, unknown>) {
  return new Request('https://prodily.app/api/settings/security/change-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('Change Email API Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'

    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
      mockUser as unknown as import('@supabase/supabase-js').User
    )
    mockEvaluateRateLimit.mockResolvedValue({ success: true, remaining: 4, resetInMs: 60000 })
    mockUsersIlikeMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'valid-access-token' }
      if (name === 'sb-refresh-token') return { value: 'valid-refresh-token' }
      return undefined
    })
  })

  it('GET returns the current authenticated user email', async () => {
    const req = new Request('https://prodily.app/api/settings/security/change-email')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.email).toBe('learner@example.com')
  })

  it('GET rejects unauthenticated requests with 401', async () => {
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
    const req = new Request('https://prodily.app/api/settings/security/change-email')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('POST rejects unauthenticated requests with 401', async () => {
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
    const res = await POST(makeRequest({ currentPassword: 'x', newEmail: 'new@example.com' }))
    expect(res.status).toBe(401)
  })

  it('rejects missing current password with 400', async () => {
    const res = await POST(makeRequest({ newEmail: 'new@example.com' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Current password is required')
  })

  it('rejects an invalid email format with 400', async () => {
    const res = await POST(makeRequest({ currentPassword: 'x', newEmail: 'not-an-email' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('valid email')
  })

  it('rejects submitting the current email as the "new" email', async () => {
    const res = await POST(makeRequest({ currentPassword: 'x', newEmail: 'Learner@Example.com' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('already your current email')
  })

  it('blocks the request when rate-limited, before touching auth', async () => {
    mockEvaluateRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 60000 })
    const res = await POST(makeRequest({ currentPassword: 'x', newEmail: 'new@example.com' }))
    expect(res.status).toBe(429)
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects an incorrect current password with 400 and never calls updateUser', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'Invalid login credentials' } })
    const res = await POST(makeRequest({ currentPassword: 'wrong', newEmail: 'new@example.com' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Current password is incorrect.')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('rejects a new email already associated with another account (server-side, before Supabase call)', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser, session: null }, error: null })
    mockUsersIlikeMaybeSingle.mockResolvedValue({ data: { id: 'some-other-user-id' }, error: null })

    const res = await POST(makeRequest({ currentPassword: 'correct', newEmail: 'taken@example.com' }))
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.error).toContain('already associated with another account')
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('returns 401 when session cookies are missing even after password verification', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser, session: null }, error: null })
    mockCookieGet.mockReturnValue(undefined)

    const res = await POST(makeRequest({ currentPassword: 'correct', newEmail: 'new@example.com' }))
    expect(res.status).toBe(401)
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('on success: hydrates a session client and calls auth.updateUser with emailRedirectTo pointed at the dedicated verification page', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser, session: null }, error: null })
    mockSetSession.mockResolvedValue({ data: {}, error: null })
    mockUpdateUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const res = await POST(makeRequest({ currentPassword: 'correct', newEmail: 'new@example.com' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'valid-access-token',
      refresh_token: 'valid-refresh-token',
    })
    expect(mockUpdateUser).toHaveBeenCalledWith(
      { email: 'new@example.com' },
      expect.objectContaining({ emailRedirectTo: expect.stringContaining('/email-verified') })
    )
  })

  it('surfaces a friendly duplicate-email error when Supabase Auth itself rejects the change', async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: mockUser, session: null }, error: null })
    mockSetSession.mockResolvedValue({ data: {}, error: null })
    mockUpdateUser.mockResolvedValue({ data: null, error: { message: 'A user with this email address has already been registered' } })

    const res = await POST(makeRequest({ currentPassword: 'correct', newEmail: 'new@example.com' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('already associated with another account')
  })
})
