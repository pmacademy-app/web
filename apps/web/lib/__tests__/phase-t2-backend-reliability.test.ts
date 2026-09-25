import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSupabase, mockAuthUser, loggedAuditActions } = vi.hoisted(() => {
  const loggedAuditActions: unknown[] = []
  const mockAuthUser = {
    current: { id: 'learner-123', email: 'learner@example.com' } as { id: string; email: string } | null,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockSupabase: any = {
    from: vi.fn(),
    rpc: vi.fn(),
  }

  return { mockSupabase, mockAuthUser, loggedAuditActions }
})

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  return {
    ...actual,
    createServiceRoleClient: () => mockSupabase,
  }
})

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async () => mockAuthUser.current),
}))

import {
  isChannelEnabledByPreferences,
  mapDbRowToNotificationPreferences,
  getResolvedUserNotificationPreferences,
  getBatchUserNotificationPreferences,
} from '@/lib/notifications/preferences/defaults'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { synchronizeProgressBadges, PROGRESS_DERIVED_BADGE_KEYS } from '@/lib/settings/settings-service'
import { recordQuizAttemptAction } from '@/lib/academy/lessons-db'
import { requireAdminUser } from '@/lib/admin/guard'
import { resolveActor } from '@/lib/api/actor'

// Reusable chainable query builder mock
function createChainableBuilder(resolvedData: unknown = null, resolvedError: unknown = null) {
  const builder: Record<string, unknown> = {}
  const chainMethods = ['select', 'eq', 'in', 'order', 'limit', 'range', 'ilike', 'filter']
  chainMethods.forEach((m) => {
    builder[m] = vi.fn().mockReturnValue(builder)
  })
  builder.single = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError })
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: resolvedData, error: resolvedError })
  builder.insert = vi.fn().mockReturnValue(builder)
  builder.upsert = vi.fn().mockReturnValue(builder)
  builder.update = vi.fn().mockReturnValue(builder)
  builder.delete = vi.fn().mockReturnValue(builder)
  builder.then = (onfulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: resolvedData, error: resolvedError }).then(onfulfilled)
  return builder
}

describe('Phase T2 — Core Backend Reliability Regression Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loggedAuditActions.length = 0
    mockAuthUser.current = { id: 'learner-123', email: 'learner@example.com' }

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'users') {
        return createChainableBuilder({
          is_admin: false,
          email: mockAuthUser.current?.email || 'learner@example.com',
          current_streak: 2,
        })
      }
      if (table === 'admin_audit_logs') {
        return {
          insert: vi.fn().mockImplementation((row) => {
            loggedAuditActions.push(row)
            return Promise.resolve({ error: null })
          }),
        }
      }
      if (table === 'email_queue') {
        const b = createChainableBuilder({ id: 'q-default' })
        return b
      }
      return createChainableBuilder()
    })

    mockSupabase.rpc.mockResolvedValue({ data: null, error: null })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // T2.1 — Notification Preference Source of Truth
  // ─────────────────────────────────────────────────────────────────────────────
  describe('T2.1: Notification Preferences Source of Truth', () => {
    it('State 1: No preference row falls back to standard communication defaults', () => {
      const prefs = mapDbRowToNotificationPreferences('user-1', null)
      expect(prefs.userId).toBe('user-1')
      expect(prefs.allNotifications).toBe(true)
      expect(prefs.allEmail).toBe(true)
      expect(prefs.allInApp).toBe(true)
      // Default: learning & achievements email are FALSE, inApp is TRUE
      expect(prefs.learning.email).toBe(false)
      expect(prefs.learning.inApp).toBe(true)
      expect(prefs.achievements.email).toBe(false)
      expect(prefs.achievements.inApp).toBe(true)
      // Security is always true
      expect(prefs.security.email).toBe(true)
      expect(prefs.security.inApp).toBe(true)

      expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(false)
      expect(isChannelEnabledByPreferences(prefs, 'learning', 'in_app')).toBe(true)
      expect(isChannelEnabledByPreferences(prefs, 'security', 'email')).toBe(true)
    })

    it('State 2: Explicit preference row matching defaults is respected', () => {
      const dbRow = {
        user_id: 'user-2',
        all_notifications: true,
        all_email: true,
        all_in_app: true,
        learning_email: false,
        learning_in_app: true,
        achievements_email: false,
        achievements_in_app: true,
      }
      const prefs = mapDbRowToNotificationPreferences('user-2', dbRow)
      expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(false)
      expect(isChannelEnabledByPreferences(prefs, 'achievements', 'email')).toBe(false)
      expect(isChannelEnabledByPreferences(prefs, 'learning', 'in_app')).toBe(true)
    })

    it('State 3: Explicit user opt-out is strictly enforced across channels', () => {
      // Opt out of all email
      const optOutAllEmail = mapDbRowToNotificationPreferences('user-3', {
        user_id: 'user-3',
        all_email: false,
        learning_email: true, // overridden by master all_email
      })
      expect(isChannelEnabledByPreferences(optOutAllEmail, 'learning', 'email')).toBe(false)

      // Opt out of learning in-app specifically
      const optOutLearningInApp = mapDbRowToNotificationPreferences('user-3', {
        user_id: 'user-3',
        all_in_app: true,
        learning_in_app: false,
      })
      expect(isChannelEnabledByPreferences(optOutLearningInApp, 'learning', 'in_app')).toBe(false)

      // Opt out of all notifications globally
      const optOutGlobal = mapDbRowToNotificationPreferences('user-3', {
        user_id: 'user-3',
        all_notifications: false,
      })
      expect(isChannelEnabledByPreferences(optOutGlobal, 'learning', 'email')).toBe(false)
      expect(isChannelEnabledByPreferences(optOutGlobal, 'learning', 'in_app')).toBe(false)
    })

    it('State 4: Explicit user opt-in for learning & achievement emails is respected', () => {
      const optInRow = {
        user_id: 'user-4',
        all_notifications: true,
        all_email: true,
        learning_email: true,
        achievements_email: true,
      }
      const prefs = mapDbRowToNotificationPreferences('user-4', optInRow)
      expect(isChannelEnabledByPreferences(prefs, 'learning', 'email')).toBe(true)
      expect(isChannelEnabledByPreferences(prefs, 'achievements', 'email')).toBe(true)
    })

    it('getResolvedUserNotificationPreferences queries the database and falls back gracefully', async () => {
      mockSupabase.from.mockImplementationOnce(() =>
        createChainableBuilder({
          user_id: 'user-db',
          learning_email: true,
          all_email: true,
        })
      )

      const prefs = await getResolvedUserNotificationPreferences(mockSupabase as never, 'user-db')
      expect(prefs.learning.email).toBe(true)
    })

    it('getBatchUserNotificationPreferences loads multiple users in a single query', async () => {
      mockSupabase.from.mockImplementationOnce(() =>
        createChainableBuilder([
          { user_id: 'u1', learning_email: true },
          { user_id: 'u2', learning_email: false, all_email: false },
        ])
      )

      const map = await getBatchUserNotificationPreferences(mockSupabase as never, ['u1', 'u2', 'u3'])
      expect(map.size).toBe(3)
      expect(map.get('u1')?.learning.email).toBe(true)
      expect(map.get('u2')?.allEmail).toBe(false)
      // u3 not in DB -> falls back to default
      expect(map.get('u3')?.learning.email).toBe(false)
    })

    it('enqueueNotificationItem respects explicit opt-in for learning email', async () => {
      const res = await enqueueNotificationItem({
        userId: 'u-optin',
        toEmail: 'learner@example.com',
        channel: 'email',
        templateKey: 'learning.module_complete',
        templateVariables: { moduleSlug: 'foundations' },
        eventType: 'module.completed',
        category: 'learning',
        priorityLevel: 'medium',
        preloadedPreferences: mapDbRowToNotificationPreferences('u-optin', {
          user_id: 'u-optin',
          learning_email: true,
          all_email: true,
        }),
      })

      expect(res.success).toBe(true)
      expect(res.queueId).toBe('q-default')
    })

    it('critical authentication emails bypass user opt-out preferences', async () => {
      const optOutPrefs = mapDbRowToNotificationPreferences('u-critical', {
        user_id: 'u-critical',
        all_notifications: false,
        all_email: false,
      })

      const res = await enqueueNotificationItem({
        userId: 'u-critical',
        toEmail: 'user@example.com',
        channel: 'email',
        templateKey: 'auth.verify_email',
        templateVariables: { token: 'xyz' },
        eventType: 'auth.verify_email',
        category: 'security',
        priorityLevel: 'critical',
        preloadedPreferences: optOutPrefs,
      })

      expect(res.success).toBe(true)
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // T2.2 — XP Trigger Performance & Correctness
  // ─────────────────────────────────────────────────────────────────────────────
  describe('T2.2: XP Trigger Performance & Correctness', () => {
    it('calculates level title correctly across all 9 level tiers (500 XP steps)', () => {
      const computeLevel = (totalXp: number) => Math.min(9, Math.max(1, Math.floor(totalXp / 500) + 1))
      expect(computeLevel(0)).toBe(1)
      expect(computeLevel(499)).toBe(1)
      expect(computeLevel(500)).toBe(2)
      expect(computeLevel(999)).toBe(2)
      expect(computeLevel(1000)).toBe(3)
      expect(computeLevel(4000)).toBe(9)
      expect(computeLevel(50000)).toBe(9) // capped at 9
    })

    it('migration script defines scoped anti-tampering and delete triggers', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const migrationPath = path.resolve(
        process.cwd(),
        '../../supabase/migrations/20260925000002_phase_t2_backend_reliability.sql'
      )
      const content = fs.readFileSync(migrationPath, 'utf-8')

      // Verifies trigger optimization logic exists in migration
      expect(content).toContain('CREATE TRIGGER trigger_update_user_xp')
      expect(content).toContain('AFTER INSERT OR UPDATE OR DELETE ON public.xp_events')
      expect(content).toContain('pg_trigger_depth() > 1')
      expect(content).toContain('OLD.total_xp IS NOT DISTINCT FROM NEW.total_xp')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // T2.3 — Lesson Completion Atomicity
  // ─────────────────────────────────────────────────────────────────────────────
  describe('T2.3: Lesson Completion Atomicity', () => {
    it('uses PostgreSQL RPC record_lesson_quiz_completion when available', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: {
          success: true,
          total_xp_awarded: 30,
          is_first_attempt: true,
          completed_at: new Date().toISOString(),
        },
        error: null,
      })

      const result = await recordQuizAttemptAction(
        mockSupabase as never,
        'user-atomic',
        'les_04ix6b',
        [
          { question_id: 'q-les_04ix6b-1', selected_option: 0 },
        ]
      )

      expect(mockSupabase.rpc).toHaveBeenCalledWith('record_lesson_quiz_completion', expect.objectContaining({
        p_user_id: 'user-atomic',
        p_lesson_id: 'les_04ix6b',
      }))
      expect(result.success).toBe(true)
    })

    it('propagates XP errors instead of silently swallowing them in fallback path', async () => {
      mockSupabase.rpc.mockRejectedValueOnce(new Error('RPC function not found'))
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'quiz_attempts') {
          return createChainableBuilder(null, null)
        }
        if (table === 'user_lesson_progress') {
          return createChainableBuilder({ completed_at: 'now', xp_earned: 30 }, null)
        }
        if (table === 'xp_events') {
          const b = createChainableBuilder([], null)
          b.insert = vi.fn().mockResolvedValue({ error: new Error('Ledger write constraint failure') })
          return b
        }
        return createChainableBuilder({ current_streak: 2 }, null)
      })

      await expect(
        recordQuizAttemptAction(
          mockSupabase as never,
          'user-fail',
          'les_04ix6b',
          [{ question_id: 'q-les_04ix6b-1', selected_option: 0 }]
        )
      ).rejects.toThrow('Failed to record XP event')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // T2.4 — Progress Reset / Badge Consistency
  // ─────────────────────────────────────────────────────────────────────────────
  describe('T2.4: Progress Reset & Badge Consistency', () => {
    it('identifies all progress-derived badges and leaves account-level badges untouched', () => {
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('first_lesson')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('module_complete')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('curriculum_explorer')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('pm_academy_graduate')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('first_perfect_quiz')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('quiz_master')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('first_capstone')
      expect(PROGRESS_DERIVED_BADGE_KEYS).toContain('capstones_all')

      // Account-level badges NOT in progress reset list
      expect(PROGRESS_DERIVED_BADGE_KEYS).not.toContain('portfolio_published')
      expect(PROGRESS_DERIVED_BADGE_KEYS).not.toContain('first_level_up')
      expect(PROGRESS_DERIVED_BADGE_KEYS).not.toContain('streak_7')
    })

    it('full progress reset revokes progress-derived badges from user_badges', async () => {
      const deletedBadgeIds: string[] = []
      const localSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'badges') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [
                  { id: 'b-first-lesson', key: 'first_lesson' },
                  { id: 'b-grad', key: 'pm_academy_graduate' },
                ],
              }),
            }
          }
          if (table === 'user_badges') {
            return {
              delete: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedBadgeIds.push(...ids)
                return Promise.resolve({ error: null })
              }),
            }
          }
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      await synchronizeProgressBadges(localSupabase as never, 'user-reset', true)
      expect(deletedBadgeIds).toEqual(['b-first-lesson', 'b-grad'])
    })

    it('module-specific reset only revokes badges that are no longer satisfied', async () => {
      const deletedBadgeIds: string[] = []
      const localSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [
                  // 1 lesson remains in other modules (first_lesson remains satisfied)
                  { lesson_id: 'les_02', status: 'completed', quiz_score: 80, quiz_attempts: 1 },
                ],
                error: null,
              }),
            }
          }
          if (table === 'capstone_submissions') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [], error: null }), // 0 capstones
            }
          }
          if (table === 'badges') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockImplementation((col: string, keys: string[]) => {
                // Ensure first_lesson is NOT in revokedKeys because 1 lesson still completed
                expect(keys).not.toContain('first_lesson')
                expect(keys).toContain('module_complete')
                expect(keys).toContain('pm_academy_graduate')
                return Promise.resolve({
                  data: [{ id: 'b-mod', key: 'module_complete' }],
                })
              }),
            }
          }
          if (table === 'user_badges') {
            return {
              delete: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockImplementation((col: string, ids: string[]) => {
                deletedBadgeIds.push(...ids)
                return Promise.resolve({ error: null })
              }),
            }
          }
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ error: null }),
          }
        }),
      }

      await synchronizeProgressBadges(localSupabase as never, 'user-mod-reset', false)
      expect(deletedBadgeIds).toEqual(['b-mod'])
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // T2.5 — Admin Audit Log False Positives
  // ─────────────────────────────────────────────────────────────────────────────
  describe('T2.5: Admin Audit Log False Positives', () => {
    it('legitimate learner on dual-role route (learner + admin) does NOT write access_denied audit log', async () => {
      const req = new Request('http://localhost:3000/api/learner-or-admin', {
        headers: { cookie: 'sb-token=valid-learner' },
      })

      // Resolve actor for dual-role route
      const resolution = await resolveActor(req, { allow: ['admin', 'learner'] })
      expect(resolution.ok).toBe(true)
      if (resolution.ok) {
        expect(resolution.actor.kind).toBe('learner')
      }

      // VERIFY: No audit log was created for learner on dual-role route
      expect(loggedAuditActions.length).toBe(0)
    })

    it('legitimate admin on dual-role route succeeds as admin', async () => {
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'users') {
          return createChainableBuilder({
            is_admin: true,
            email: 'admin@prodily.app',
          })
        }
        return createChainableBuilder()
      })

      const req = new Request('http://localhost:3000/api/dual-role-admin', {
        headers: { cookie: 'sb-token=valid-admin' },
      })

      const resolution = await resolveActor(req, { allow: ['admin', 'learner'] })
      expect(resolution.ok).toBe(true)
      if (resolution.ok) {
        expect(resolution.actor.kind).toBe('admin')
      }
      expect(loggedAuditActions.length).toBe(0)
    })

    it('unauthorized learner on strictly admin route DOES write access_denied audit log', async () => {
      const req = new Request('http://localhost:3000/api/admin/strictly-admin', {
        headers: { cookie: 'sb-token=valid-learner' },
      })

      // Call requireAdminUser with silent: false (default for admin-only routes)
      const adminResult = await requireAdminUser(req, { silent: false })
      expect(adminResult.authorized).toBe(false)
      expect(adminResult.statusCode).toBe(403)

      // VERIFY: Genuine unauthorized admin attempt IS audited
      expect(loggedAuditActions.length).toBe(1)
      expect(loggedAuditActions[0]).toEqual(expect.objectContaining({
        action: 'access_denied',
        admin_email: 'learner@example.com',
      }))
    })

    it('unauthenticated caller on admin route returns 401 without recording access_denied log', async () => {
      const req = new Request('http://localhost:3000/api/admin/strictly-admin')

      // Mock unauthenticated
      mockAuthUser.current = null

      const result = await requireAdminUser(req)
      expect(result.authorized).toBe(false)
      expect(result.statusCode).toBe(401)
      expect(loggedAuditActions.length).toBe(0)
    })
  })
})
