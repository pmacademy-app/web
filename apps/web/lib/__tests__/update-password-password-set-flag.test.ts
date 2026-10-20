/**
 * A Google-only account that sets a password through the reset link gets no 'email' identity,
 * so update-password records app_metadata.password_set = true on success. Best effort: a
 * failure to record it is logged and never fails the password change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockUpdateUser, mockAdminUpdateUserById, mockLogSystemError } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockAdminUpdateUserById: vi.fn(),
  mockLogSystemError: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}))

vi.mock('@/lib/supabase', () => ({
  createAuthenticatedServerClient: vi.fn(() => ({ auth: { updateUser: mockUpdateUser } })),
  createServiceRoleClient: vi.fn(() => ({ auth: { admin: { updateUserById: mockAdminUpdateUserById } } })),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 4, resetInMs: 0 })),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: mockLogSystemError,
}))

import { POST } from '../../app/api/auth/update-password/route'

function request() {
  return new NextRequest('http://localhost:3000/api/auth/update-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'sb-access-token=recovery-token' },
    body: JSON.stringify({ newPassword: 'newValidPassword123' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAdminUpdateUserById.mockResolvedValue({ data: {}, error: null })
})

describe('update-password records password_set', () => {
  it('sets app_metadata.password_set on success', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: 'usr_google', app_metadata: { provider: 'google', providers: ['google'] } } },
      error: null,
    })
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith('usr_google', { app_metadata: { password_set: true } })
  })

  it('skips the admin call when the flag is already set', async () => {
    mockUpdateUser.mockResolvedValue({
      data: { user: { id: 'usr_google', app_metadata: { password_set: true } } },
      error: null,
    })
    expect((await POST(request())).status).toBe(200)
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled()
  })

  it('still succeeds and logs when recording the flag fails', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: { id: 'usr_google', app_metadata: {} } }, error: null })
    mockAdminUpdateUserById.mockResolvedValue({ data: null, error: { message: 'admin down' } })
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
    expect(mockLogSystemError).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'update_password_mark_password_set_failed' })
    )
  })

  it('does not record the flag when the password update fails', async () => {
    mockUpdateUser.mockResolvedValue({ data: { user: null }, error: { message: 'weak', code: 'weak_password', status: 422 } })
    const res = await POST(request())
    expect(res.status).not.toBe(200)
    expect(mockAdminUpdateUserById).not.toHaveBeenCalled()
  })
})
