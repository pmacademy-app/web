import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST as feedbackEligibilityPost } from '../../app/api/feedback/eligibility/route'
import { PATCH as notificationsPatch } from '../../app/api/notifications/route'
import * as authLib from '../auth'
import * as supabaseLib from '../supabase'

describe('Phase 2 — Polling & Duplicate Request Reduction Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Feedback Dwell Time & Eligibility Request Collapsing', () => {
    it('POST /api/feedback/eligibility directly returns eligibility and completed prompts', async () => {
      vi.spyOn(authLib, 'getAuthenticatedUserFromRequest').mockResolvedValue({
        id: 'usr_learner_1',
      } as unknown as import('@supabase/supabase-js').User)

      let updatedTotalSeconds = 0
      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string) => {
          if (col === 'user_id') {
            return Promise.resolve({
              data: [], // No completed prompts yet
              error: null,
            })
          }
          if (col === 'id') {
            return {
              single: async () => ({
                data: { total_active_seconds: 3550 },
                error: null,
              }),
            }
          }
          return mockChain
        }),
        update: vi.fn().mockImplementation((data: { total_active_seconds: number }) => {
          updatedTotalSeconds = data.total_active_seconds
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      vi.spyOn(supabaseLib, 'createServiceRoleClient').mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/feedback/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incrementSeconds: 60 }),
      })

      const res = await feedbackEligibilityPost(req)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.success).toBe(true)
      // 3550 + 60 = 3610 seconds
      expect(updatedTotalSeconds).toBe(3610)
      expect(json.activeSeconds).toBe(3610)
      // 3610 >= 3600, so usage_1hr milestone is eligible immediately in the POST response!
      expect(json.eligiblePrompts).toEqual(['usage_1hr'])
    })

    it('POST /api/feedback/eligibility does not return usage_1hr if already completed/dismissed', async () => {
      vi.spyOn(authLib, 'getAuthenticatedUserFromRequest').mockResolvedValue({
        id: 'usr_learner_1',
      } as unknown as import('@supabase/supabase-js').User)

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string) => {
          if (col === 'user_id') {
            return Promise.resolve({
              data: [{ prompt_key: 'usage_1hr' }], // Already completed!
              error: null,
            })
          }
          if (col === 'id') {
            return {
              single: async () => ({
                data: { total_active_seconds: 4000 },
                error: null,
              }),
            }
          }
          return mockChain
        }),
        update: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      }

      vi.spyOn(supabaseLib, 'createServiceRoleClient').mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/feedback/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incrementSeconds: 60 }),
      })

      const res = await feedbackEligibilityPost(req)
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.eligiblePrompts).toEqual([])
      expect(json.completedPrompts).toContain('usage_1hr')
    })
  })

  describe('2. Notifications Batch Mark-Read & Isolation', () => {
    it('PATCH /api/notifications marks only the batch of displayed notification IDs as read', async () => {
      vi.spyOn(authLib, 'getAuthenticatedUserFromRequest').mockResolvedValue({
        id: 'usr_learner_2',
      } as unknown as import('@supabase/supabase-js').User)

      let updatedIds: string[] = []
      let scopedUserId = ''
      let isReadVal = false

      const mockChain = {
        update: vi.fn().mockImplementation((data: { is_read: boolean }) => {
          isReadVal = data.is_read
          return mockChain
        }),
        in: vi.fn().mockImplementation((col: string, vals: string[]) => {
          if (col === 'id') updatedIds = vals
          return mockChain
        }),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === 'user_id') scopedUserId = val
          return mockChain
        }),
      }

      // Mock terminal promise resolution
      Object.assign(mockChain, Promise.resolve({ error: null }))

      vi.spyOn(supabaseLib, 'createServiceRoleClient').mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          notificationIds: ['notif_01', 'notif_02'],
        }),
      })

      const res = await notificationsPatch(req)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.markedIds).toEqual(['notif_01', 'notif_02'])
      expect(updatedIds).toEqual(['notif_01', 'notif_02'])
      expect(scopedUserId).toBe('usr_learner_2') // Strictly scoped to current user
      expect(isReadVal).toBe(true)
    })

    it('PATCH /api/notifications preserves individual mark_read by notificationId', async () => {
      vi.spyOn(authLib, 'getAuthenticatedUserFromRequest').mockResolvedValue({
        id: 'usr_learner_3',
      } as unknown as import('@supabase/supabase-js').User)

      let targetId = ''
      let targetUser = ''
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === 'id') targetId = val
          if (col === 'user_id') targetUser = val
          return mockChain
        }),
      }

      vi.spyOn(supabaseLib, 'createServiceRoleClient').mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_read',
          notificationId: 'notif_single_1',
        }),
      })

      const res = await notificationsPatch(req)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.success).toBe(true)
      expect(json.notificationId).toBe('notif_single_1')
      expect(targetId).toBe('notif_single_1')
      expect(targetUser).toBe('usr_learner_3')
    })

    it('PATCH /api/notifications preserves mark_all_read action', async () => {
      vi.spyOn(authLib, 'getAuthenticatedUserFromRequest').mockResolvedValue({
        id: 'usr_learner_4',
      } as unknown as import('@supabase/supabase-js').User)

      let markedAllUser = ''
      const mockChain = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation((col: string, val: string) => {
          if (col === 'user_id') markedAllUser = val
          return mockChain
        }),
      }

      vi.spyOn(supabaseLib, 'createServiceRoleClient').mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_all_read',
        }),
      })

      const res = await notificationsPatch(req)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.success).toBe(true)
      expect(markedAllUser).toBe('usr_learner_4')
    })
  })
})
