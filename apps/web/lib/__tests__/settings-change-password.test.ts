import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../../app/api/settings/security/route'
import * as authLib from '../auth'
import * as supabaseLib from '../supabase'

const { mockEvaluatePersistentRateLimit } = vi.hoisted(() => ({
  mockEvaluatePersistentRateLimit: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
}))

// `withRoute`'s declarative `rateLimit` (D-1 audit fix) calls straight through to
// `evaluatePersistentRateLimit`. Mocked here — rather than relying on the real
// in-memory fallback — so the shared per-user bucket can't leak state between the
// many other tests in this file that reuse the same mock user id.
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: mockEvaluatePersistentRateLimit,
}))

describe('Settings Change Password API Endpoint Unit Tests', () => {
  const mockUser = {
    id: 'usr_test_123',
    email: 'learner@example.com',
  }

  const mockSignInWithPassword = vi.fn()
  const mockUpdateUserById = vi.fn()
  const mockAdminSignOut = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockEvaluatePersistentRateLimit.mockResolvedValue({ success: true, remaining: 4, resetInMs: 900000 })
    mockAdminSignOut.mockResolvedValue({ data: null, error: null })
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
      mockUser as unknown as import('@supabase/supabase-js').User
    )
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        admin: {
          updateUserById: mockUpdateUserById,
          signOut: mockAdminSignOut,
        },
      },
    } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)
  })

  it('0. Rejects non-JSON Content-Type with 415', async () => {
    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'password=123456',
    })

    const res = await POST(req)
    expect(res.status).toBe(415)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('Unsupported Content-Type')
  })

  it('1. Rejects unauthenticated requests with 401 Unauthorized', async () => {
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'oldPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    // B7-F: canonical ADR-006 envelope. `code` is the stable contract; the prose
    // changed to the wrapper's generic copy.
    expect(json.code).toBe('UNAUTHORIZED')
  })

  it('2. Rejects short new password (< 6 chars) with 400', async () => {
    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'oldPassword123',
        newPassword: 'short',
        confirmPassword: 'short',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('at least 6 characters')
  })

  it('3. Rejects mismatched new passwords with 400', async () => {
    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'oldPassword123',
        newPassword: 'validPassword123',
        confirmPassword: 'differentPassword456',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('New passwords do not match')
  })

  it('4. Rejects identical old and new passwords with 400', async () => {
    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'samePassword123',
        newPassword: 'samePassword123',
        confirmPassword: 'samePassword123',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('New password must be different')
  })

  it('5. Rejects invalid current password with 400 and clear error', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials' },
    })

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'wrongPassword123',
        newPassword: 'brandNewPassword123',
        confirmPassword: 'brandNewPassword123',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Current password is incorrect.')
    expect(mockUpdateUserById).not.toHaveBeenCalled()
  })

  it('6. Successfully updates password via admin API when current password matches', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: mockUser,
        session: { access_token: 'new-tok-123', refresh_token: 'new-ref-123', expires_in: 3600 },
      },
      error: null,
    })

    mockUpdateUserById.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'correctCurrentPassword123',
        newPassword: 'freshNewPassword456',
        confirmPassword: 'freshNewPassword456',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.message).toContain('Password updated successfully')

    expect(mockUpdateUserById).toHaveBeenCalledWith('usr_test_123', {
      password: 'freshNewPassword456',
    })

    // D-3 audit fix: every other session/refresh token for this user is revoked,
    // scoped to "others" so the freshly minted session (about to be written to
    // this response's cookies) is deliberately spared — the caller stays logged in.
    expect(mockAdminSignOut).toHaveBeenCalledWith('new-tok-123', 'others')
  })

  it('7. D-1 audit fix: rate-limits the endpoint per authenticated user, fail-closed', async () => {
    mockEvaluatePersistentRateLimit.mockResolvedValue({ success: false, remaining: 0, resetInMs: 900000 })

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'correctCurrentPassword123',
        newPassword: 'freshNewPassword456',
        confirmPassword: 'freshNewPassword456',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.code).toBe('RATE_LIMITED')

    // Refused before the endpoint ever re-verifies the current password — the
    // whole point is to stop this from being an unlimited-attempt oracle.
    expect(mockSignInWithPassword).not.toHaveBeenCalled()
    expect(mockEvaluatePersistentRateLimit).toHaveBeenCalledWith(
      'settings_change_password_usr_test_123',
      expect.objectContaining({ limit: 5, failClosed: true })
    )
  })

  it('8. D-4 audit fix: maps a known admin-API failure code to safe authored copy', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 } },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({
      data: null,
      error: { code: 'weak_password', message: 'internal driver text about password hashing' },
    })

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'correctCurrentPassword123',
        newPassword: 'freshNewPassword456',
        confirmPassword: 'freshNewPassword456',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toContain('does not meet the minimum security requirements')
    expect(json.error).not.toContain('internal driver text')
  })

  it('9. D-4 audit fix: an unrecognized admin-API failure never reaches the client as raw provider text', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 } },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({
      data: null,
      error: { code: 'unexpected_failure', message: 'relation "auth.users" constraint violated at 10.0.0.5' },
    })

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'correctCurrentPassword123',
        newPassword: 'freshNewPassword456',
        confirmPassword: 'freshNewPassword456',
      }),
    })

    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json.success).toBe(false)
    expect(json.code).toBe('SERVER_ERROR')
    expect(json.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    expect(JSON.stringify(json)).not.toContain('constraint violated')
    expect(JSON.stringify(json)).not.toContain('10.0.0.5')
  })

  it('10. D-3 audit fix: a session-revocation failure does not block an otherwise successful password change', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: mockUser,
        session: { access_token: 'new-tok-123', refresh_token: 'new-ref-123', expires_in: 3600 },
      },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({ data: { user: mockUser }, error: null })
    mockAdminSignOut.mockRejectedValue(new Error('provider unavailable'))

    const req = new Request('https://prodily.app/api/settings/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'correctCurrentPassword123',
        newPassword: 'freshNewPassword456',
        confirmPassword: 'freshNewPassword456',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
