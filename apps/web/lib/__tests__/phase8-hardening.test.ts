import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { POST as settingsSecurityPost } from '../../app/api/settings/security/route'
import { POST as cronProcessEmailQueuePost } from '../../app/api/cron/process-email-queue/route'
import { POST as cronDailyReminderPost } from '../../app/api/cron/daily-reminder/route'
import { POST as cronWeeklyRecapPost } from '../../app/api/cron/weekly-recap/route'
import { POST as cronRetryFailedPost } from '../../app/api/cron/retry-failed/route'
import { POST as cronCleanupPost } from '../../app/api/cron/cleanup/route'
import { POST as feedbackEligibilityPost } from '../../app/api/feedback/eligibility/route'
import { POST as reviewCompletePost } from '../../app/api/review/complete/route'
import { deleteAccount } from '../settings/settings-service'
import { onFirstLessonCompletedReferralCheck } from '../referral/referral-service'
import * as authLib from '../auth'
import * as adminGuardLib from '../admin/guard'
import * as supabaseLib from '../supabase'
import * as flashcardsService from '../flashcards-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(),
  logAdminAction: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

vi.mock('@/lib/notifications/queue/processor', () => ({
  processEmailQueue: vi.fn().mockResolvedValue({ processed: 5, delivered: 5, failed: 0, retried: 0 }),
  enqueueNotificationItem: vi.fn().mockResolvedValue({ success: true, queueId: 'q-123' }),
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    isAutomationEnabled: vi.fn().mockResolvedValue(true),
    isGlobalPauseActive: vi.fn().mockResolvedValue(false),
    getDigestSchedules: vi.fn().mockResolvedValue({
      dailyReminder: { enabled: true, hourUtc: new Date().getUTCHours() },
      weeklyRecap: { enabled: true, dayOfWeek: new Date().getUTCDay(), hourUtc: new Date().getUTCHours() },
    }),
    recordDigestRun: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('Phase 8 — Platform Hardening, Security & Production Reliability Suite', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('1. Security: Settings Password Change Re-Authentication Enforcement', () => {
    it('rejects password change if currentPassword is missing from body', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue({
        id: 'user_123',
        email: 'user@example.com',
      } as unknown as import('@supabase/supabase-js').User)

      const req = new Request('https://prodily.app/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: 'newSecretPassword123',
          confirmPassword: 'newSecretPassword123',
        }),
      })

      const res = await settingsSecurityPost(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Current password is required')
    })

    it('rejects password change if currentPassword is empty string', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue({
        id: 'user_123',
        email: 'user@example.com',
      } as unknown as import('@supabase/supabase-js').User)

      const req = new Request('https://prodily.app/api/settings/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: '   ',
          newPassword: 'newSecretPassword123',
          confirmPassword: 'newSecretPassword123',
        }),
      })

      const res = await settingsSecurityPost(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.success).toBe(false)
      expect(data.error).toContain('Current password is required')
    })
  })

  describe('2. Security: CRON Endpoint Protection Hardening', () => {
    it('rejects /api/cron/process-email-queue when CRON_SECRET is unset and no admin session exists', async () => {
      delete process.env.CRON_SECRET
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new Request('https://prodily.app/api/cron/process-email-queue', { method: 'POST' })
      const res = await cronProcessEmailQueuePost(req)
      expect(res.status).toBe(401)
      const json = await res.json()
      expect(json.error).toContain('Unauthorized')
    })

    it('allows /api/cron/process-email-queue with valid CRON_SECRET bearer token', async () => {
      process.env.CRON_SECRET = 'super-secret-cron-token-999'

      const req = new Request('https://prodily.app/api/cron/process-email-queue', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-cron-token-999' },
      })

      const res = await cronProcessEmailQueuePost(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
    })

    it('rejects /api/cron/daily-reminder when unauthorized', async () => {
      process.env.CRON_SECRET = 'expected-secret'
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new Request('https://prodily.app/api/cron/daily-reminder', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-secret' },
      })

      const res = await cronDailyReminderPost(req)
      expect(res.status).toBe(401)
    })

    it('rejects /api/cron/weekly-recap when unauthorized', async () => {
      delete process.env.CRON_SECRET
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: false,
        error: 'Access denied: Admin privileges required',
        statusCode: 403,
      })

      const req = new Request('https://prodily.app/api/cron/weekly-recap', { method: 'POST' })
      const res = await cronWeeklyRecapPost(req)
      expect(res.status).toBe(401)
    })

    it('rejects /api/cron/retry-failed when unauthorized', async () => {
      delete process.env.CRON_SECRET
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new Request('https://prodily.app/api/cron/retry-failed', { method: 'POST' })
      const res = await cronRetryFailedPost(req)
      expect(res.status).toBe(401)
    })

    it('rejects /api/cron/cleanup when unauthorized', async () => {
      delete process.env.CRON_SECRET
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      })

      const req = new Request('https://prodily.app/api/cron/cleanup', { method: 'POST' })
      const res = await cronCleanupPost(req)
      expect(res.status).toBe(401)
    })

    it('allows /api/cron/cleanup when authenticated as Admin user', async () => {
      delete process.env.CRON_SECRET
      vi.mocked(adminGuardLib.requireAdminUser).mockResolvedValue({
        authorized: true,
        userId: 'admin_123',
        email: 'admin@prodily.app',
      })

      const req = new Request('https://prodily.app/api/cron/cleanup', { method: 'POST' })
      const res = await cronCleanupPost(req)
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.success).toBe(true)
    })
  })

  describe('3. Data Integrity: Complete Account Deletion Cascade', () => {
    it('deletes user records from all tables including user_feedback and user_feedback_prompts', async () => {
      const deletedTables: string[] = []

      const mockDeleteChain = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        update: vi.fn().mockReturnThis(),
      }

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          deletedTables.push(table)
          return mockDeleteChain
        }),
      } as unknown as SupabaseClient<Database>

      await deleteAccount(mockSupabase, 'target_user_xyz')

      expect(deletedTables).toContain('user_feedback')
      expect(deletedTables).toContain('user_feedback_prompts')
      expect(deletedTables).toContain('user_lesson_progress')
      expect(deletedTables).toContain('users')
    })
  })

  describe('4. Input Validation & Reliability: Usage Time Bounding', () => {
    it('bounds active usage increment to maximum 300 seconds per sync request', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue({
        id: 'learner_123',
      } as unknown as import('@supabase/supabase-js').User)

      let updatedTotalSeconds: number | null = null

      const mockChain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { total_active_seconds: 100 } }),
        update: vi.fn().mockImplementation((payload: { total_active_seconds: number }) => {
          updatedTotalSeconds = payload.total_active_seconds
          return {
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue({
        from: vi.fn().mockReturnValue(mockChain),
      } as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/feedback/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incrementSeconds: 999999, // Malicious / huge input
        }),
      })

      const res = await feedbackEligibilityPost(req)
      expect(res.status).toBe(200)
      // Original 100 + bounded increment 300 = 400
      expect(updatedTotalSeconds).toBe(400)
    })
  })

  describe('5. Input Validation: Review Session Stats Bounding', () => {
    it('sanitizes and bounds review session cards and XP counts', async () => {
      vi.mocked(authLib.getAuthenticatedUserFromRequest).mockResolvedValue({
        id: 'reviewer_123',
      } as unknown as import('@supabase/supabase-js').User)

      let recordedCards = -1
      let recordedXp: number | undefined = -1

      vi.spyOn(flashcardsService, 'recordReviewSessionCompletion').mockImplementation(
        async (_supabase, _userId, cards, xp) => {
          recordedCards = cards
          recordedXp = xp
          return { success: true }
        }
      )

      vi.mocked(supabaseLib.createServiceRoleClient).mockReturnValue({} as unknown as ReturnType<typeof supabaseLib.createServiceRoleClient>)

      const req = new Request('https://prodily.app/api/review/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardsReviewedCount: 999999,
          xpEarned: -500,
        }),
      })

      const res = await reviewCompletePost(req)
      expect(res.status).toBe(200)
      expect(recordedCards).toBe(500) // Upper bounded to 500
      expect(recordedXp).toBe(0) // Lower bounded to 0
    })
  })

  describe('6. Data Integrity: Atomic Referral Activation Under Concurrency', () => {
    it('returns already_activated and does not duplicate rewards when update returns 0 affected rows', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'referrals') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'ref_123', referrer_id: 'usr_referrer', status: 'signed_up' },
                    }),
                  }),
                }),
              }),
              update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({ data: [] }), // 0 rows updated because another concurrent request won
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const result = await onFirstLessonCompletedReferralCheck(mockSupabase, 'usr_new_learner')
      expect(result.rewarded).toBe(false)
      expect(result.reason).toBe('already_activated')
    })
  })
})
