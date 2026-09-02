/**
 * Security & architecture tests for updatePasswordAction() Server Action.
 *
 * Verifies the authorization chain:
 *   HttpOnly access token -> getUser(accessToken) -> validated userId -> admin.updateUserById(userId, password)
 *
 * Key properties tested:
 * 1. accessToken is explicitly passed to auth.getUser(accessToken) for JWT validation
 * 2. userId is ALWAYS derived from Supabase JWT validation, never from client input
 * 3. Admin API is only called after successful identity verification
 * 4. Failed getUser() prevents Admin API call
 * 5. Expired/invalid tokens are handled cleanly
 * 6. Recovery cookies are cleared on success and on terminal failure
 * 7. Service role client is not exposed; no user-controlled userId path exists
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Shared mock state -------------------------------------------------------
const mockGetUser = vi.fn()
const mockUpdateUserById = vi.fn()
const mockRefreshSession = vi.fn()
const mockCookieGet = vi.fn()
const mockCookieDelete = vi.fn()

// --- Mock next/headers -------------------------------------------------------
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    delete: mockCookieDelete,
  })),
}))

// --- Mock @supabase/supabase-js createClient ---------------------------------
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
  })),
}))

// --- Mock lib/supabase -------------------------------------------------------
vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
      },
    },
  })),
}))

import { updatePasswordAction } from '../../app/(auth)/reset-password/actions'
import * as supabaseLib from '@/lib/supabase'

// --- Test Suite --------------------------------------------------------------
describe('updatePasswordAction() Server Action — Authorization Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // --- 1. No session cookies ----------------------------------------------
  it('1. Returns error immediately when no cookies present (no Admin API call)', async () => {
    mockCookieGet.mockReturnValue(undefined) // no access or refresh token

    const result = await updatePasswordAction('newPassword123')

    expect(result.error).toBe(
      'No active recovery session found. Please request a new password reset link.'
    )
    // Critical: Admin API must NOT be called without any session
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  // --- 2. Valid access token -> explicit getUser(accessToken) -> successful update --
  it('2. Valid access token: explicitly passes token to getUser(accessToken) -> admin.updateUserById() called with that exact userId', async () => {
    const VALIDATED_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    const ACCESS_TOKEN = 'valid-recovery-access-token-jwt'

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: ACCESS_TOKEN }
      return undefined
    })

    mockGetUser.mockResolvedValue({
      data: { user: { id: VALIDATED_USER_ID, email: 'user@example.com' } },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({
      data: { user: { id: VALIDATED_USER_ID } },
      error: null,
    })

    const result = await updatePasswordAction('MyNewSecurePass!')

    // Explicit validation check: getUser was called with the exact access token from the cookie
    expect(mockGetUser).toHaveBeenCalledWith(ACCESS_TOKEN)

    // Admin API must have been called with EXACTLY the validated userId
    expect(mockUpdateUserById).toHaveBeenCalledWith(VALIDATED_USER_ID, {
      password: 'MyNewSecurePass!',
    })
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()

    // Cookies must be cleared
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-access-token')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-refresh-token')
  })

  // --- 3. CRITICAL: No client-controlled userId path ----------------------
  it('3. No client-controlled userId: Admin API only ever receives userId from getUser() JWT validation', async () => {
    const REAL_USER_ID = 'real-user-uuid-abcd-1234-5678-ef90abcdef12'
    const ATTACKER_TOKEN = 'attacker-crafted-token'

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: ATTACKER_TOKEN }
      return undefined
    })

    // Supabase validates the JWT and returns the REAL user (ignores any attacker claim)
    mockGetUser.mockResolvedValue({
      data: { user: { id: REAL_USER_ID, email: 'real@example.com' } },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({ data: { user: { id: REAL_USER_ID } }, error: null })

    await updatePasswordAction('newpass123')

    expect(mockGetUser).toHaveBeenCalledWith(ATTACKER_TOKEN)
    // Regardless of what was in the cookie, the userId fed to admin API is what Supabase validated
    expect(mockUpdateUserById).toHaveBeenCalledWith(REAL_USER_ID, expect.any(Object))
    expect(mockUpdateUserById).toHaveBeenCalledTimes(1)
  })

  // --- 4. Failed getUser() -> Admin API NOT called -------------------------
  it('4. When getUser() fails (invalid/expired JWT), Admin API is NOT called and falls through to refresh', async () => {
    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'expired-access-token' }
      return undefined // no refresh token
    })

    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired', code: 'token_expired' },
    })

    const result = await updatePasswordAction('newpass123')

    // No refresh token available -> terminal failure, no Admin API call
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(result.error).toBeTruthy()
  })

  // --- 5. Expired access token + valid refresh token fallback -------------
  it('5. Expired access token + valid refresh token: userId from refresh -> Admin API called with that userId', async () => {
    const REFRESH_USER_ID = 'refresh-user-uuid-1234-abcd-5678-ef90abcdef12'

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'expired-access-token' }
      if (name === 'sb-refresh-token') return { value: 'valid-refresh-token' }
      return undefined
    })

    // Access token getUser() fails
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired', code: 'token_expired' },
    })

    // Refresh token exchange succeeds
    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          user: { id: REFRESH_USER_ID, email: 'user@example.com' },
        },
        user: { id: REFRESH_USER_ID },
      },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({ data: { user: { id: REFRESH_USER_ID } }, error: null })

    const result = await updatePasswordAction('newpass123')

    // Admin API called with userId from the refresh session (server-validated)
    expect(mockUpdateUserById).toHaveBeenCalledWith(REFRESH_USER_ID, { password: 'newpass123' })
    expect(result.success).toBe(true)
  })

  // --- 6. Expired/invalid refresh token -> clean failure -------------------
  it('6. Expired/invalid refresh token: Admin API NOT called, cookies cleared, friendly error returned', async () => {
    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'expired-access-token' }
      if (name === 'sb-refresh-token') return { value: 'expired-refresh-token' }
      return undefined
    })

    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })

    mockRefreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Refresh token not found', code: 'refresh_token_not_found' },
    })

    const result = await updatePasswordAction('newpass123')

    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(result.error).toContain('expired')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-access-token')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-refresh-token')
  })

  // --- 7. Admin API failure propagates as error ----------------------------
  it('7. Admin API failure (e.g., user not found in DB) returns error, does not throw', async () => {
    const USER_ID = 'abcd1234-ef56-7890-abcd-ef1234567890'

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'valid-token' }
      return undefined
    })

    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'user@example.com' } },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'User not found' },
    })

    const result = await updatePasswordAction('newpass123')

    expect(result.error).toBeTruthy()
    expect(result.success).toBeUndefined()
  })

  // --- 8. createServiceRoleClient is called ONLY after identity verified ---
  it('8. createServiceRoleClient() is invoked only after successful getUser() identity check', async () => {
    const createServiceRoleClientSpy = vi.spyOn(supabaseLib, 'createServiceRoleClient')

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'valid-token' }
      return undefined
    })

    // Simulate failed identity verification
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT invalid' } })

    await updatePasswordAction('newpass123')

    // Service role client must NOT be created when identity verification fails
    expect(createServiceRoleClientSpy).not.toHaveBeenCalled()
  })

  // --- 9. Successful update clears recovery cookies ------------------------
  it('9. Successful update clears both recovery cookies', async () => {
    const USER_ID = 'success-user-uuid-1234-5678-abcdef901234'

    mockCookieGet.mockImplementation((name: string) => {
      if (name === 'sb-access-token') return { value: 'valid-token' }
      return undefined
    })

    mockGetUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'user@example.com' } },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })

    await updatePasswordAction('newValidPass123')

    expect(mockCookieDelete).toHaveBeenCalledWith('sb-access-token')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-refresh-token')
  })
})

