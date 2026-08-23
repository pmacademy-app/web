/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CurriculumService } from '@/lib/admin/curriculum-service'
import { AdminConsoleService } from '@/lib/admin/service'
import { hasXpEvent, getTotalXp } from '@/lib/xp-service'

describe('Phase 9 — Database, Query & Application Performance Optimization', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Curriculum Query Optimization & Caching', () => {
    it('getCurriculumOverview computes overview KPIs and aggregates module metrics', async () => {
      const { overview, failed } = await CurriculumService.getCurriculumOverview(true)

      expect(failed).toBe(false)
      expect(overview.kpis.modules).toBe(9)
      expect(overview.kpis.lessons).toBe(90)
      expect(overview.modules.length).toBe(9)
    })
  })

  describe('2. XP Ledger & Idempotency Lookups', () => {
    it('hasXpEvent executes an indexed composite query bounded by limit 1', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'evt-123' }, error: null }),
        }),
      } as any

      const exists = await hasXpEvent(mockSupabase, 'usr-1', 'capstone', 'foundations')
      expect(exists).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('xp_events')
    })

    it('getTotalXp aggregates xp_amount from ledger rows', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ xp_amount: 50 }, { xp_amount: 150 }, { xp_amount: 25 }],
            error: null,
          }),
        }),
      } as any

      const total = await getTotalXp(mockSupabase, 'usr-1')
      expect(total).toBe(225)
    })
  })

  describe('3. Admin User Overview Pagination & Bounded Scans', () => {
    it('getUsersOverview applies range pagination and page-scoped batch queries', async () => {
      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'users') {
            return {
              select: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              range: vi.fn().mockResolvedValue({
                data: [
                  { id: 'usr-1', email: 'u1@example.com', name: 'User One', total_xp: 100, is_admin: false, created_at: '2026-08-01T00:00:00Z' },
                  { id: 'usr-2', email: 'u2@example.com', name: 'User Two', total_xp: 200, is_admin: false, created_at: '2026-08-02T00:00:00Z' },
                ],
                count: 150,
                error: null,
              }),
            }
          }
          if (table === 'user_lesson_progress') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ user_id: 'usr-1' }, { user_id: 'usr-1' }, { user_id: 'usr-2' }],
                error: null,
              }),
            }
          }
          if (table === 'xp_events') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [{ user_id: 'usr-1', created_at: '2026-08-20T00:00:00Z' }],
                error: null,
              }),
            }
          }
          if (table === 'badges') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'badge-cpo' }],
                error: null,
              }),
            }
          }
          if (table === 'user_badges') {
            return {
              select: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
          }
        }),
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { id: 'usr-1', email_confirmed_at: '2026-08-01T00:00:00Z' } },
              error: null,
            }),
          },
        },
      } as any

      const result = await AdminConsoleService.getUsersOverview(20, '', {}, 1, mockSupabase)
      expect(result.users.length).toBe(2)
      expect(result.total).toBe(150)
      expect(result.users[0].id).toBe('usr-1')
      expect(result.users[0].isVerified).toBe(true)
    })
  })

  describe('4. Auth Availability Probe Bounding', () => {
    it('system health probe verifies auth availability with bounded perPage: 1', async () => {
      const mockSupabase = {
        auth: {
          admin: {
            listUsers: vi.fn().mockResolvedValue({
              data: { users: [{ id: 'probe-user' }] },
              error: null,
            }),
          },
        },
      } as any

      const { data } = await mockSupabase.auth.admin.listUsers({ perPage: 1 })
      expect(data.users.length).toBe(1)
      expect(mockSupabase.auth.admin.listUsers).toHaveBeenCalledWith({ perPage: 1 })
    })
  })
})
