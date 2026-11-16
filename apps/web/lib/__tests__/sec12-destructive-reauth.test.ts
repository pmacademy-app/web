import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'
import * as authLib from '@/lib/auth'
import * as settingsService from '@/lib/settings/settings-service'

const mockEvaluatePersistentRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...args: unknown[]) => mockEvaluatePersistentRateLimit(...args),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 5, resetInMs: 60_000 })),
}))

vi.mock('@/lib/settings/settings-service', () => ({
  deleteAccount: vi.fn(async () => undefined),
  resetFlashcards: vi.fn(async () => undefined),
  resetProgress: vi.fn(async () => undefined),
  resetSkillRadar: vi.fn(async () => undefined),
  resetStreak: vi.fn(async () => undefined),
  resetXp: vi.fn(async () => 0),
}))

const mockGetUserById = vi.fn()
const mockSignInWithPassword = vi.fn()
const mockDeleteUser = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    auth: {
      admin: {
        getUserById: mockGetUserById,
        deleteUser: mockDeleteUser,
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
      delete: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
  })),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => null),
}))

describe('SEC-12 Destructive Re-Authentication & Rate Limiting', () => {
  const learnerActor = {
    kind: 'learner' as const,
    userId: 'usr_destruct_123',
    email: 'destruct@example.com',
  }

  const passwordUser = {
    id: 'usr_destruct_123',
    email: 'destruct@example.com',
    app_metadata: { provider: 'email', providers: ['email'], password_set: true },
    identities: [{ provider: 'email' }],
    last_sign_in_at: new Date().toISOString(),
  }

  const googleUser = {
    id: 'usr_destruct_123',
    email: 'destruct@example.com',
    app_metadata: { provider: 'google', providers: ['google'], password_set: false },
    identities: [{ provider: 'google' }],
    last_sign_in_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockEvaluatePersistentRateLimit.mockResolvedValue({
      success: true,
      remaining: 4,
      resetInMs: 900000,
    })
    mockGetUserById.mockResolvedValue({
      data: { user: passwordUser },
      error: null,
    })
    mockSignInWithPassword.mockResolvedValue({
      data: { user: passwordUser, session: { access_token: 'tok' } },
      error: null,
    })
    mockDeleteUser.mockResolvedValue({ data: null, error: null })
    vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue(
      passwordUser as unknown as import('@supabase/supabase-js').User
    )
  })

  describe('verifyDestructiveReauth helper unit tests', () => {
    it('enforces shared fail-closed rate limit (5 attempts per 15 min)', async () => {
      mockEvaluatePersistentRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        resetInMs: 900000,
      })

      const result = await verifyDestructiveReauth({
        actor: learnerActor,
        body: { currentPassword: 'password123' },
        expectedPhrase: 'DELETE',
      })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.response.status).toBe(429)
        const json = await result.response.json()
        expect(json.code).toBe('RATE_LIMITED')
        expect(result.response.headers.get('Retry-After')).toBe('900')
      }
      expect(mockEvaluatePersistentRateLimit).toHaveBeenCalledWith(
        'settings_destructive_usr_destruct_123',
        expect.objectContaining({ limit: 5, failClosed: true })
      )
    })

    describe('Password accounts', () => {
      it('rejects missing currentPassword with 400', async () => {
        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: {},
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.response.status).toBe(400)
          const json = await result.response.json()
          expect(json.error).toBe('Current password is required.')
        }
      })

      it('rejects incorrect currentPassword with 400', async () => {
        mockSignInWithPassword.mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        })

        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: { currentPassword: 'wrong-password' },
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.response.status).toBe(400)
          const json = await result.response.json()
          expect(json.error).toBe('Current password is incorrect.')
        }
      })

      it('succeeds with valid currentPassword', async () => {
        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: { currentPassword: 'validPassword123' },
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.userId).toBe('usr_destruct_123')
          expect(result.user.email).toBe('destruct@example.com')
        }
      })
    })

    describe('Google-only accounts', () => {
      beforeEach(() => {
        mockGetUserById.mockResolvedValue({
          data: { user: googleUser },
          error: null,
        })
      })

      it('rejects missing or mismatched confirmation phrase with 400', async () => {
        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: { confirmationPhrase: 'WRONG_PHRASE' },
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.response.status).toBe(400)
          const json = await result.response.json()
          expect(json.error).toContain('Confirmation phrase must be "DELETE"')
        }
      })

      it('rejects stale sign-in (> 10 minutes) with 403 RECENT_LOGIN_REQUIRED', async () => {
        const staleGoogleUser = {
          ...googleUser,
          last_sign_in_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(), // 11 minutes ago
        }
        mockGetUserById.mockResolvedValue({
          data: { user: staleGoogleUser },
          error: null,
        })

        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: { confirmationPhrase: 'DELETE' },
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.response.status).toBe(403)
          const json = await result.response.json()
          expect(json.code).toBe('RECENT_LOGIN_REQUIRED')
          expect(json.error).toContain('Recent sign-in required')
        }
      })

      it('succeeds with matching confirmation phrase and recent sign-in (< 10 minutes)', async () => {
        const result = await verifyDestructiveReauth({
          actor: learnerActor,
          body: { confirmationPhrase: 'DELETE' },
          expectedPhrase: 'DELETE',
        })

        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.userId).toBe('usr_destruct_123')
        }
      })
    })
  })

  describe('Route-level enforcement of destructive re-auth', () => {
    it('delete-account route rejects missing password with 400 and halts deletion', async () => {
      const { POST: deleteAccountPOST } = await import('@/app/api/settings/delete-account/route')
      const req = new NextRequest('https://prodily.app/api/settings/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      const res = await deleteAccountPOST(req)
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.error).toBe('Current password is required.')
      expect(settingsService.deleteAccount).not.toHaveBeenCalled()
      expect(mockDeleteUser).not.toHaveBeenCalled()
    })

    it('delete-account route succeeds with valid password and executes deletion', async () => {
      const { POST: deleteAccountPOST } = await import('@/app/api/settings/delete-account/route')
      const req = new NextRequest('https://prodily.app/api/settings/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await deleteAccountPOST(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(settingsService.deleteAccount).toHaveBeenCalledWith(expect.anything(), 'usr_destruct_123')
      expect(mockDeleteUser).toHaveBeenCalledWith('usr_destruct_123')
    })

    it('reset/progress route enforces re-auth and preserves module_slug argument', async () => {
      const { POST: resetProgressPOST } = await import('@/app/api/settings/reset/progress/route')

      // 1. Rejects without password
      const badReq = new NextRequest('https://prodily.app/api/settings/reset/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_slug: 'foundations' }),
      })
      const badRes = await resetProgressPOST(badReq)
      expect(badRes.status).toBe(400)
      expect(settingsService.resetProgress).not.toHaveBeenCalled()

      // 2. Succeeds with password and passes module_slug
      const goodReq = new NextRequest('https://prodily.app/api/settings/reset/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_slug: 'foundations',
          currentPassword: 'validPassword123',
        }),
      })
      const goodRes = await resetProgressPOST(goodReq)
      expect(goodRes.status).toBe(200)
      expect(settingsService.resetProgress).toHaveBeenCalledWith(
        expect.anything(),
        'usr_destruct_123',
        'foundations'
      )
    })

    it('reset/xp route enforces re-auth and returns new total_xp', async () => {
      const { POST: resetXpPOST } = await import('@/app/api/settings/reset/xp/route')
      const req = new NextRequest('https://prodily.app/api/settings/reset/xp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await resetXpPOST(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.total_xp).toBe(0)
      expect(settingsService.resetXp).toHaveBeenCalledWith(expect.anything(), 'usr_destruct_123')
    })

    it('reset/flashcards route enforces re-auth and executes reset', async () => {
      const { POST: resetFlashcardsPOST } = await import('@/app/api/settings/reset/flashcards/route')
      const req = new NextRequest('https://prodily.app/api/settings/reset/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await resetFlashcardsPOST(req)
      expect(res.status).toBe(200)
      expect(settingsService.resetFlashcards).toHaveBeenCalledWith(expect.anything(), 'usr_destruct_123')
    })

    it('reset/streak route enforces re-auth and executes reset', async () => {
      const { POST: resetStreakPOST } = await import('@/app/api/settings/reset/streak/route')
      const req = new NextRequest('https://prodily.app/api/settings/reset/streak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await resetStreakPOST(req)
      expect(res.status).toBe(200)
      expect(settingsService.resetStreak).toHaveBeenCalledWith(expect.anything(), 'usr_destruct_123')
    })

    it('reset/skill-radar route enforces re-auth and executes reset', async () => {
      const { POST: resetSkillRadarPOST } = await import('@/app/api/settings/reset/skill-radar/route')
      const req = new NextRequest('https://prodily.app/api/settings/reset/skill-radar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await resetSkillRadarPOST(req)
      expect(res.status).toBe(200)
      expect(settingsService.resetSkillRadar).toHaveBeenCalledWith(expect.anything(), 'usr_destruct_123')
    })

    it('blocks reset endpoints when rate limit is exceeded', async () => {
      mockEvaluatePersistentRateLimit.mockResolvedValue({
        success: false,
        remaining: 0,
        resetInMs: 900000,
      })

      const { POST: resetStreakPOST } = await import('@/app/api/settings/reset/streak/route')
      const req = new NextRequest('https://prodily.app/api/settings/reset/streak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'validPassword123' }),
      })

      const res = await resetStreakPOST(req)
      expect(res.status).toBe(429)
      const json = await res.json()
      expect(json.code).toBe('RATE_LIMITED')
      expect(settingsService.resetStreak).not.toHaveBeenCalled()
    })
  })
})
