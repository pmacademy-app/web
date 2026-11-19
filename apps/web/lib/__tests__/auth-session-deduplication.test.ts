import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { User, SupabaseClient } from '@supabase/supabase-js'
import { getAuthenticatedUserFromRequest } from '../auth'
import * as supabaseModule from '../supabase'
import type { Database } from '@/lib/supabase'

describe('Authentication & Session Lookup Deduplication', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Request-Scoped API Auth Deduplication (WeakMap Cache)', () => {
    it('executes token resolution exactly once per Request instance when called multiple times', async () => {
      const mockUser: User = {
        id: 'usr_dedup_1',
        email: 'learner@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      }

      let getUserCallCount = 0
      const mockAuthClient = {
        auth: {
          getUser: vi.fn().mockImplementation(async () => {
            getUserCallCount++
            return { data: { user: mockUser }, error: null }
          }),
        },
      }

      vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockReturnValue(
        mockAuthClient as unknown as SupabaseClient<Database>
      )

      const request = new Request('https://prodily.app/api/xp', {
        headers: {
          Authorization: 'Bearer valid_jwt_token_123',
        },
      })

      // First call resolves user and caches in WeakMap
      const user1 = await getAuthenticatedUserFromRequest(request)
      // Subsequent calls on the same Request instance reuse cached Promise
      const user2 = await getAuthenticatedUserFromRequest(request)
      const user3 = await getAuthenticatedUserFromRequest(request)

      expect(user1?.id).toBe('usr_dedup_1')
      expect(user2?.id).toBe('usr_dedup_1')
      expect(user3?.id).toBe('usr_dedup_1')
      // Network call executed only once!
      expect(getUserCallCount).toBe(1)
    })

    it('isolates authentication lookups across different Request instances', async () => {
      const mockUserA: User = {
        id: 'user_a',
        email: 'a@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      }
      const mockUserB: User = {
        id: 'user_b',
        email: 'b@example.com',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      }

      vi.spyOn(supabaseModule, 'createAuthenticatedServerClient').mockImplementation((token: string) => {
        const user = token === 'token_a' ? mockUserA : mockUserB
        return {
          auth: {
            getUser: async () => ({ data: { user }, error: null }),
          },
        } as unknown as SupabaseClient<Database>
      })

      const reqA = new Request('https://prodily.app/api/profile', {
        headers: { Authorization: 'Bearer token_a' },
      })
      const reqB = new Request('https://prodily.app/api/profile', {
        headers: { Authorization: 'Bearer token_b' },
      })

      const resolvedA = await getAuthenticatedUserFromRequest(reqA)
      const resolvedB = await getAuthenticatedUserFromRequest(reqB)

      expect(resolvedA?.id).toBe('user_a')
      expect(resolvedB?.id).toBe('user_b')
      expect(resolvedA?.id).not.toBe(resolvedB?.id)
    })

    it('returns null when no Authorization header or session cookies are present', async () => {
      const req = new Request('https://prodily.app/api/profile')
      const user = await getAuthenticatedUserFromRequest(req)
      expect(user).toBeNull()
    })
  })
})
