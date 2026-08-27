import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../../app/api/settings/security/route'
import * as authLib from '../auth'
import * as supabaseLib from '../supabase'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
}))

describe('Settings Change Password API Endpoint Unit Tests', () => {
  const mockUser = {
    id: 'usr_test_123',
    email: 'learner@example.com',
  }

  const mockSignInWithPassword = vi.fn()
  const mockUpdateUserById = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
      mockUser as unknown as import('@supabase/supabase-js').User
    )
    vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
        admin: {
          updateUserById: mockUpdateUserById,
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
    expect(json.error).toContain('Unauthorized')
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
  })
})
