/**
 * Security tests for updatePasswordAction() (the reset page's server action).
 *
 * Authorization chain (H1):
 *   signed recovery marker (callback, recovery links only)
 *   + httpOnly session -> getUser(accessToken) / refresh -> validated userId
 *   -> marker.uid === userId -> rate limits -> admin.updateUserById -> global sign-out
 *
 * Properties tested:
 * 1. A session without a valid recovery marker cannot change the password
 * 2. The marker must name the same user the session resolves to
 * 3. userId comes only from provider validation, never from client input
 * 4. Server-side minimum length, persistent per-IP and per-user limits
 * 5. Every session is revoked after a successful change (L5)
 * 6. Recovery cookies and the marker are cleared on success and terminal failure
 * 7. Provider error text never crosses to the browser
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// --- Shared mock state -------------------------------------------------------
const mockGetUser = vi.fn()
const mockUpdateUserById = vi.fn()
const mockAdminSignOut = vi.fn()
const mockRefreshSession = vi.fn()
const mockCookieGet = vi.fn()
const mockCookieDelete = vi.fn()
const mockRateLimit = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: mockCookieGet,
    delete: mockCookieDelete,
  })),
  headers: vi.fn(async () => new Headers({ 'x-real-ip': '203.0.113.7' })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      refreshSession: mockRefreshSession,
    },
  })),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        updateUserById: mockUpdateUserById,
        signOut: mockAdminSignOut,
      },
    },
  })),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: unknown[]) => mockRateLimit(...args),
}))

import { updatePasswordAction } from '../../app/(auth)/reset-password/actions'
import { RECOVERY_MARKER_COOKIE, signRecoveryMarker } from '@/lib/auth/recovery-marker'
import * as supabaseLib from '@/lib/supabase'

const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const ACCESS_TOKEN = 'valid-recovery-access-token-jwt'
const PASSWORD = 'MyNewSecurePass!'

function cookieJar(values: Record<string, string | undefined>) {
  mockCookieGet.mockImplementation((name: string) => (values[name] ? { value: values[name] } : undefined))
}

function validUser(id = USER_ID) {
  mockGetUser.mockResolvedValue({ data: { user: { id, email: 'user@example.com' } }, error: null })
}

describe('updatePasswordAction() recovery-only authorization chain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
    process.env.OAUTH_STATE_SECRET = 'test-oauth-state-secret-at-least-32-chars-long'
    mockRateLimit.mockResolvedValue({ success: true, remaining: 4, resetInMs: 60_000 })
    mockUpdateUserById.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
    mockAdminSignOut.mockResolvedValue({ data: null, error: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns an error without any session cookie (no provider or Admin call)', async () => {
    cookieJar({ [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    const result = await updatePasswordAction(PASSWORD)
    expect(result.error).toBe('No active recovery session found. Please request a new password reset link.')
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('H1: a normal session without the recovery marker cannot change the password', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN })
    validUser()
    const result = await updatePasswordAction(PASSWORD)
    expect(result.code).toBe('AUTH_SESSION_SYNC_FAILED')
    expect(mockUpdateUserById).not.toHaveBeenCalled()
    // A legitimately signed-in learner is not logged out by opening the form.
    expect(mockCookieDelete).not.toHaveBeenCalledWith('sb-access-token')
  })

  it('H1: a forged or expired marker is refused', async () => {
    validUser()
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: 'forged.marker' })
    expect((await updatePasswordAction(PASSWORD)).code).toBe('AUTH_SESSION_SYNC_FAILED')

    const stale = signRecoveryMarker(USER_ID, Date.now() - 11 * 60 * 1000)!
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: stale })
    expect((await updatePasswordAction(PASSWORD)).code).toBe('AUTH_SESSION_SYNC_FAILED')
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('H1: a marker issued for another user is refused', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker('someone-else')! })
    validUser()
    const result = await updatePasswordAction(PASSWORD)
    expect(result.error).toBeTruthy()
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('valid marker + session: updates the validated user, revokes all sessions, clears cookies', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    validUser()

    const result = await updatePasswordAction(PASSWORD)

    expect(result).toEqual({ success: true })
    expect(mockGetUser).toHaveBeenCalledWith(ACCESS_TOKEN)
    expect(mockUpdateUserById).toHaveBeenCalledWith(USER_ID, {
      password: PASSWORD,
      app_metadata: { password_set: true },
    })
    expect(mockAdminSignOut).toHaveBeenCalledWith(ACCESS_TOKEN, 'global')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-access-token')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-refresh-token')
    expect(mockCookieDelete).toHaveBeenCalledWith({ name: RECOVERY_MARKER_COOKIE, path: '/reset-password' })
  })

  it('a failed global sign-out does not undo a successful change', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    validUser()
    mockAdminSignOut.mockRejectedValue(new Error('network'))
    expect(await updatePasswordAction(PASSWORD)).toEqual({ success: true })
  })

  it('enforces the server-side minimum length before reading any cookie', async () => {
    const result = await updatePasswordAction('short')
    expect(result.code).toBe('AUTH_PASSWORD_TOO_WEAK')
    expect(result.error).toBe('Password must be at least 10 characters.')
    expect(mockCookieGet).not.toHaveBeenCalled()
  })

  it('applies the persistent per-IP and per-user limits (fail closed)', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    validUser()
    await updatePasswordAction(PASSWORD)
    expect(mockRateLimit).toHaveBeenCalledWith('update_pwd_ip:203.0.113.7', expect.objectContaining({ limit: 10, failClosed: true }))
    expect(mockRateLimit).toHaveBeenCalledWith(`update_pwd_user:user:${USER_ID}`, expect.objectContaining({ limit: 5, failClosed: true }))
  })

  it('returns AUTH_RATE_LIMITED and changes nothing when a limit is exhausted', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    validUser()
    mockRateLimit.mockImplementation(async (key: string) =>
      key.startsWith('update_pwd_user:') ? { success: false, remaining: 0, resetInMs: 1 } : { success: true, remaining: 1, resetInMs: 1 }
    )
    const result = await updatePasswordAction(PASSWORD)
    expect(result.code).toBe('AUTH_RATE_LIMITED')
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('expired access token + valid refresh token: user id from the refresh, sign-out with the fresh token', async () => {
    cookieJar({
      'sb-access-token': 'expired-access-token',
      'sb-refresh-token': 'valid-refresh-token',
      [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)!,
    })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired', code: 'token_expired' } })
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'new-access-token', refresh_token: 'new-refresh', user: { id: USER_ID } } },
      error: null,
    })

    const result = await updatePasswordAction(PASSWORD)

    expect(result.success).toBe(true)
    expect(mockUpdateUserById).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ password: PASSWORD }))
    expect(mockAdminSignOut).toHaveBeenCalledWith('new-access-token', 'global')
  })

  it('expired refresh token: no Admin call, cookies cleared, friendly error', async () => {
    cookieJar({
      'sb-access-token': 'expired-access-token',
      'sb-refresh-token': 'expired-refresh-token',
      [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)!,
    })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT expired' } })
    mockRefreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'Refresh token not found' } })

    const result = await updatePasswordAction(PASSWORD)

    expect(mockUpdateUserById).not.toHaveBeenCalled()
    expect(result.error).toContain('expired')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-access-token')
    expect(mockCookieDelete).toHaveBeenCalledWith('sb-refresh-token')
  })

  it('returns classified copy, never the raw GoTrue message', async () => {
    cookieJar({ 'sb-access-token': ACCESS_TOKEN, [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    validUser()
    const RAW = 'Password should be at least 6 characters. [gotrue:422] relation "auth.users" constraint violated'
    mockUpdateUserById.mockResolvedValue({ data: { user: null }, error: { message: RAW, status: 422, code: 'weak_password' } })

    const result = await updatePasswordAction(PASSWORD)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(RAW)
    expect(serialized).not.toContain('gotrue')
    expect(result.code).toBe('AUTH_PASSWORD_TOO_WEAK')
    expect(mockAdminSignOut).not.toHaveBeenCalled()
  })

  it('createServiceRoleClient() is not invoked when identity verification fails', async () => {
    const spy = vi.spyOn(supabaseLib, 'createServiceRoleClient')
    cookieJar({ 'sb-access-token': 'bad', [RECOVERY_MARKER_COOKIE]: signRecoveryMarker(USER_ID)! })
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'JWT invalid' } })
    await updatePasswordAction(PASSWORD)
    expect(spy).not.toHaveBeenCalled()
  })
})
