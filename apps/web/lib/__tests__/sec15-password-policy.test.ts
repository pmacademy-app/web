import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import * as z from 'zod'
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MIN_LENGTH_MESSAGE,
  PASSWORD_NEW_MIN_LENGTH_MESSAGE,
  PASSWORD_MIN_LENGTH_HINT,
  PASSWORD_WEAK_REQUIREMENTS_MESSAGE,
} from '@/lib/auth/password-policy'
import { classifyAuthError, resolveApiAuthError } from '@/lib/auth/errors'
import { POST as updatePasswordPOST } from '@/app/api/auth/update-password/route'
import * as authLib from '@/lib/auth'

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 5, resetInMs: 60_000 })),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 5, resetInMs: 60_000 })),
}))

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => ({ success: true })),
  evaluateSiteverifyBudget: vi.fn(async () => ({ success: true, remaining: 10, resetInMs: 60_000 })),
}))

vi.mock('@/lib/admin/settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({ maintenanceMode: false, allowSignups: true, requireEmailVerification: false })),
    isEmailVerificationRequired: vi.fn(async () => false),
  },
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => 'mock-id'),
}))

vi.mock('@/lib/auth', () => ({
  ensureUserProfile: vi.fn(async () => undefined),
  getAuthenticatedUserFromRequest: vi.fn(async () => null),
}))

const mockGetUserById = vi.fn()
const mockSignInWithPassword = vi.fn()
const mockUpdateUserById = vi.fn()
const mockAdminSignOut = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        updateUserById: mockUpdateUserById,
        signOut: mockAdminSignOut,
      },
      signInWithPassword: mockSignInWithPassword,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: { id: 'u1' }, error: null })),
        })),
      })),
    })),
  })),
  createAuthenticatedServerClient: vi.fn(() => ({
    auth: {
      updateUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
    },
  })),
}))

describe('SEC-15 Password Policy (10-character minimum)', () => {
  const mockUser = {
    id: 'usr_test_123',
    email: 'learner@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockAdminSignOut.mockResolvedValue({ data: null, error: null })
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          ...mockUser,
          identities: [{ provider: 'email' }],
          app_metadata: { providers: ['email'], password_set: true },
        },
      },
      error: null,
    })
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: mockUser,
        session: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 },
      },
      error: null,
    })
    mockUpdateUserById.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    })
  })

  it('defines MIN_PASSWORD_LENGTH as 10', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10)
    expect(PASSWORD_MIN_LENGTH_MESSAGE).toBe('Password must be at least 10 characters.')
    expect(PASSWORD_NEW_MIN_LENGTH_MESSAGE).toBe('New password must be at least 10 characters long.')
    expect(PASSWORD_MIN_LENGTH_HINT).toBe('Must be at least 10 characters long.')
  })

  describe('Signup route password validation', () => {
    it('rejects a 9-character password at signup with 400', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
      const { POST: signupPOST } = await import('@/app/api/auth/signup/route')
      const req = new NextRequest('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: '123456789', // 9 characters
          turnstileToken: 'test-token',
          acceptedTerms: true,
          confirmedMinimumAge: true,
        }),
      })

      const res = await signupPOST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toContain('at least 10 characters')
    })

    it('accepts a 10-character password at signup', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
      const { POST: signupPOST } = await import('@/app/api/auth/signup/route')
      const req = new NextRequest('https://prodily.app/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Jane Doe',
          email: 'jane@example.com',
          password: '1234567890', // 10 characters
          turnstileToken: 'test-token',
          acceptedTerms: true,
          confirmedMinimumAge: true,
        }),
      })

      const res = await signupPOST(req)
      const json = await res.json()
      if (res.status === 400) {
        expect(json.error).not.toContain('at least 10 characters')
      }
    })
  })

  describe('Update-password route password validation', () => {
    it('rejects a 9-character password at update-password with 400', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
      const req = new NextRequest('https://prodily.app/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: '123456789' }),
      })

      const res = await updatePasswordPOST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('Password must be at least 10 characters.')
    })

    it('accepts a 10-character password at update-password', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(null)
      const req = new NextRequest('https://prodily.app/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: '1234567890' }),
      })

      const res = await updatePasswordPOST(req)
      // Should pass password length check and proceed to token check (401 because no tokens in request)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toBe('No active recovery session found. Please request a new password reset link.')
    })
  })

  describe('Settings security route password validation', () => {
    it('rejects a 9-character password at settings security with 400', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
        mockUser as unknown as import('@supabase/supabase-js').User
      )
      const { POST: settingsSecurityPOST } = await import('@/app/api/settings/security/route')
      const req = new Request('https://prodily.app/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'currentPassword123',
          newPassword: '123456789',
          confirmPassword: '123456789',
        }),
      })

      const res = await settingsSecurityPOST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(json.error).toContain('at least 10 characters')
    })

    it('accepts a 10-character password at settings security', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
        mockUser as unknown as import('@supabase/supabase-js').User
      )
      const { POST: settingsSecurityPOST } = await import('@/app/api/settings/security/route')
      const req = new Request('https://prodily.app/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: 'currentPassword123',
          newPassword: '1234567890',
          confirmPassword: '1234567890',
        }),
      })

      const res = await settingsSecurityPOST(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
    })
  })

  describe('Login backward compatibility', () => {
    // Replicating LoginForm.tsx line 32 schema contract
    const loginPasswordSchema = z.string().min(1, 'Password is required.').min(6, 'Password must be at least 6 characters.')

    it('accepts 6-character passwords at login for existing users', () => {
      const result = loginPasswordSchema.safeParse('123456')
      expect(result.success).toBe(true)
    })

    it('rejects passwords shorter than 6 characters at login', () => {
      const result = loginPasswordSchema.safeParse('12345')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe('Password must be at least 6 characters.')
      }
    })
  })

  describe('Auth error classifier copy mapping', () => {
    it('maps weak password errors to 10-character guidance copy', () => {
      const classified = classifyAuthError(new Error('Password should be at least 10 characters'), 'signup')
      expect(classified.code).toBe('AUTH_PASSWORD_TOO_WEAK')
      expect(classified.message).toBe(PASSWORD_WEAK_REQUIREMENTS_MESSAGE)
      expect(classified.message).toContain('at least 10 characters')
    })

    it('survives client re-classification with identical code', () => {
      const resolved = resolveApiAuthError(
        { error: PASSWORD_WEAK_REQUIREMENTS_MESSAGE, code: 'AUTH_PASSWORD_TOO_WEAK' },
        'signup'
      )
      expect(resolved.code).toBe('AUTH_PASSWORD_TOO_WEAK')
      expect(resolved.message).toBe(PASSWORD_WEAK_REQUIREMENTS_MESSAGE)
    })
  })
})
