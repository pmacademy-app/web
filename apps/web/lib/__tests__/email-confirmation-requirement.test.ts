/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SettingsService } from '../admin/settings-service'
import { NextRequest } from 'next/server'
import { POST as handleSignup } from '@/app/api/auth/signup/route'
import { POST as handleLogin } from '@/app/api/auth/login/route'

const mockStore: {
  settings: Record<string, unknown>
  authUsers: Array<{
    id: string
    email: string
    passwordHash: string
    email_confirmed_at: string | null
    user_metadata?: Record<string, unknown>
  }>
  publicUsers: Array<{
    id: string
    email: string
    name: string | null
  }>
} = {
  settings: {},
  authUsers: [],
  publicUsers: [],
}

vi.mock('@/lib/supabase', () => {
  return {
    createServiceRoleClient: () => ({
      from: (table: string) => {
        if (table === 'system_settings') {
          return {
            select: () => ({
              eq: (_col: string, val: string) => ({
                maybeSingle: () => {
                  const valData = mockStore.settings[val]
                  return Promise.resolve({
                    data: valData ? { value: valData } : null,
                    error: null,
                  })
                },
              }),
            }),
            upsert: (row: { key: string; value: unknown }) => {
              mockStore.settings[row.key] = row.value
              return Promise.resolve({ error: null })
            },
          }
        }
        if (table === 'users') {
          return {
            select: () => ({
              eq: (col: string, val: string) => ({
                maybeSingle: () => {
                  const u = mockStore.publicUsers.find((r) => (r as any)[col] === val)
                  return Promise.resolve({ data: u || null, error: null })
                },
              }),
            }),
            insert: (payload: any) => {
              const inserted = { id: payload.id || `u-${Date.now()}`, ...payload }
              mockStore.publicUsers.push(inserted)
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: inserted, error: null }),
                }),
              }
            },
          }
        }
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
        }
      },
      auth: {
        signUp: vi.fn().mockImplementation(({ email, password, options }) => {
          const existing = mockStore.authUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
          if (existing) {
            return Promise.resolve({
              data: { user: { ...existing, identities: [] }, session: null },
              error: null,
            })
          }
          const newUser = {
            id: `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            email,
            passwordHash: password,
            email_confirmed_at: null,
            user_metadata: options?.data || {},
          }
          mockStore.authUsers.push(newUser)
          return Promise.resolve({
            data: { user: newUser, session: null },
            error: null,
          })
        }),
        signInWithPassword: vi.fn().mockImplementation(({ email, password }) => {
          const user = mockStore.authUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
          if (!user || user.passwordHash !== password) {
            return Promise.resolve({
              data: { user: null, session: null },
              error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
            })
          }
          if (!user.email_confirmed_at) {
            return Promise.resolve({
              data: { user: null, session: null },
              error: { message: 'Email not confirmed', code: 'email_not_confirmed' },
            })
          }
          return Promise.resolve({
            data: {
              user,
              session: {
                access_token: `mock-token-${user.id}`,
                refresh_token: `mock-refresh-${user.id}`,
                expires_in: 3600,
              },
            },
            error: null,
          })
        }),
        admin: {
          createUser: vi.fn().mockImplementation(({ email, password, email_confirm, user_metadata }) => {
            const existing = mockStore.authUsers.find((u) => u.email.toLowerCase() === email.toLowerCase())
            if (existing) {
              return Promise.resolve({
                data: { user: null },
                error: { message: 'User already registered', code: 'USER_EXISTS' },
              })
            }
            const newUser = {
              id: `usr-admin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              email,
              passwordHash: password,
              email_confirmed_at: email_confirm ? new Date().toISOString() : null,
              user_metadata: user_metadata || {},
            }
            mockStore.authUsers.push(newUser)
            return Promise.resolve({
              data: { user: newUser },
              error: null,
            })
          }),
          listUsers: vi.fn().mockImplementation(() => {
            return Promise.resolve({
              data: { users: mockStore.authUsers },
              error: null,
            })
          }),
          updateUserById: vi.fn().mockImplementation((userId: string, attributes: { email_confirm?: boolean }) => {
            const user = mockStore.authUsers.find((u) => u.id === userId)
            if (user && attributes.email_confirm) {
              user.email_confirmed_at = new Date().toISOString()
            }
            return Promise.resolve({ data: { user }, error: null })
          }),
        },
      },
    }),
    createAuthenticatedServerClient: (token: string) => ({
      auth: {
        getUser: vi.fn().mockImplementation(() => {
          const userId = token.replace('mock-token-', '')
          const user = mockStore.authUsers.find((u) => u.id === userId)
          return Promise.resolve({ data: { user: user || null }, error: user ? null : { message: 'Unauthorized' } })
        }),
      },
    }),
  }
})

describe('Phase 1 — Email Confirmation Requirement Control', () => {
  beforeEach(() => {
    SettingsService.invalidateCache()
    mockStore.settings = {}
    mockStore.authUsers = []
    mockStore.publicUsers = []
  })

  describe('SettingsService.isEmailVerificationRequired()', () => {
    it('defaults to true when no record exists in database', async () => {
      const isRequired = await SettingsService.isEmailVerificationRequired()
      expect(isRequired).toBe(true)
    })

    it('returns false when requireEmailVerification is set to false in product_settings', async () => {
      mockStore.settings['product_settings'] = {
        requireEmailVerification: false,
      }
      SettingsService.invalidateCache()

      const isRequired = await SettingsService.isEmailVerificationRequired()
      expect(isRequired).toBe(false)
    })

    it('returns true when requireEmailVerification is set to true in product_settings', async () => {
      mockStore.settings['product_settings'] = {
        requireEmailVerification: true,
      }
      SettingsService.invalidateCache()

      const isRequired = await SettingsService.isEmailVerificationRequired()
      expect(isRequired).toBe(true)
    })

    it('invalidates cache immediately on product settings update', async () => {
      mockStore.settings['product_settings'] = { requireEmailVerification: true }
      SettingsService.invalidateCache()
      expect(await SettingsService.isEmailVerificationRequired()).toBe(true)

      await SettingsService.updateProductSettings({ requireEmailVerification: false })
      expect(await SettingsService.isEmailVerificationRequired()).toBe(false)
    })
  })

  describe('Signup Flow — Requirement ON vs OFF', () => {
    it('creates an unconfirmed user and requires verification when setting is ON', async () => {
      mockStore.settings['product_settings'] = { requireEmailVerification: true }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Sarah Connor',
          email: 'sarah@example.com',
          password: 'Password123!',
        }),
      })

      const res = await handleSignup(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.verificationRequired).toBe(true)
      expect(json.email).toBe('sarah@example.com')

      // Verify user in store has null email_confirmed_at
      const created = mockStore.authUsers.find((u) => u.email === 'sarah@example.com')
      expect(created).toBeDefined()
      expect(created?.email_confirmed_at).toBeNull()

      // Verify cookies are NOT set (no session for unverified signup)
      expect(res.cookies.get('sb-access-token')).toBeUndefined()
    })

    it('creates an auto-confirmed user with valid session when setting is OFF', async () => {
      mockStore.settings['product_settings'] = { requireEmailVerification: false }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'John Connor',
          email: 'john@example.com',
          password: 'Password123!',
        }),
      })

      const res = await handleSignup(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.verificationRequired).toBe(false)
      expect(json.redirect).toBe('/dashboard')

      // Verify user in store has confirmed timestamp
      const created = mockStore.authUsers.find((u) => u.email === 'john@example.com')
      expect(created).toBeDefined()
      expect(created?.email_confirmed_at).not.toBeNull()

      // Verify session cookies ARE set
      expect(res.cookies.get('sb-access-token')?.value).toBeDefined()
      expect(res.cookies.get('sb-refresh-token')?.value).toBeDefined()
    })

    it('rejects duplicate email signup with 409 conflict', async () => {
      mockStore.authUsers.push({
        id: 'existing-1',
        email: 'duplicate@example.com',
        passwordHash: 'Password123!',
        email_confirmed_at: new Date().toISOString(),
      })

      mockStore.settings['product_settings'] = { requireEmailVerification: false }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Dupe User',
          email: 'duplicate@example.com',
          password: 'Password123!',
        }),
      })

      const res = await handleSignup(req)
      expect(res.status).toBe(409)
      const json = await res.json()
      expect(json.error).toContain('already exists')
    })
  })

  describe('Login Flow — Requirement ON vs OFF & JIT Auto-Confirmation', () => {
    it('allows confirmed user to log in when setting is ON', async () => {
      mockStore.authUsers.push({
        id: 'usr-confirmed-1',
        email: 'confirmed@example.com',
        passwordHash: 'SecretPassword123!',
        email_confirmed_at: '2026-08-01T00:00:00Z',
      })

      mockStore.settings['product_settings'] = { requireEmailVerification: true }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'confirmed@example.com',
          password: 'SecretPassword123!',
        }),
      })

      const res = await handleLogin(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.redirect).toBe('/dashboard')
      expect(res.cookies.get('sb-access-token')?.value).toBeDefined()
    })

    it('blocks unconfirmed user with AUTH_EMAIL_NOT_CONFIRMED when setting is ON', async () => {
      mockStore.authUsers.push({
        id: 'usr-unconfirmed-1',
        email: 'unconfirmed@example.com',
        passwordHash: 'SecretPassword123!',
        email_confirmed_at: null,
      })

      mockStore.settings['product_settings'] = { requireEmailVerification: true }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'unconfirmed@example.com',
          password: 'SecretPassword123!',
        }),
      })

      const res = await handleLogin(req)
      const json = await res.json()

      expect(res.status).toBe(403)
      expect(json.success).toBe(false)
      expect(json.code).toBe('AUTH_EMAIL_NOT_CONFIRMED')
      expect(json.requiresVerification).toBe(true)
    })

    it('safely auto-confirms existing unconfirmed user upon valid password login when setting is OFF', async () => {
      mockStore.authUsers.push({
        id: 'usr-legacy-unconfirmed',
        email: 'legacy@example.com',
        passwordHash: 'CorrectPassword123!',
        email_confirmed_at: null,
      })

      mockStore.settings['product_settings'] = { requireEmailVerification: false }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'legacy@example.com',
          password: 'CorrectPassword123!',
        }),
      })

      const res = await handleLogin(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.redirect).toBe('/dashboard')
      expect(res.cookies.get('sb-access-token')?.value).toBeDefined()

      // Verify user's email_confirmed_at was stamped
      const updated = mockStore.authUsers.find((u) => u.email === 'legacy@example.com')
      expect(updated?.email_confirmed_at).not.toBeNull()
    })

    it('rejects unconfirmed user with invalid password when setting is OFF without auto-confirming', async () => {
      mockStore.authUsers.push({
        id: 'usr-target',
        email: 'target@example.com',
        passwordHash: 'RealPassword123!',
        email_confirmed_at: null,
      })

      mockStore.settings['product_settings'] = { requireEmailVerification: false }
      SettingsService.invalidateCache()

      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'target@example.com',
          password: 'WRONG_PASSWORD',
        }),
      })

      const res = await handleLogin(req)
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.success).toBe(false)
      expect(json.code).toBe('AUTH_INVALID_CREDENTIALS')

      // Ensure user was NOT auto-confirmed because password was wrong
      const target = mockStore.authUsers.find((u) => u.email === 'target@example.com')
      expect(target?.email_confirmed_at).toBeNull()
    })
  })

  describe('Toggle Transitions & State Persistence', () => {
    it('maintains confirmed status for existing users when switching OFF -> ON', async () => {
      // User registered when toggle was OFF
      mockStore.authUsers.push({
        id: 'usr-registered-when-off',
        email: 'registered_off@example.com',
        passwordHash: 'Password123!',
        email_confirmed_at: '2026-08-01T00:00:00Z',
      })

      // Admin toggles setting to ON
      await SettingsService.updateProductSettings({ requireEmailVerification: true })

      // User attempts login
      const req = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'registered_off@example.com',
          password: 'Password123!',
        }),
      })

      const res = await handleLogin(req)
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.redirect).toBe('/dashboard')
    })
  })
})
