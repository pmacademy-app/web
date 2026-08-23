/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track mocks
const mockRevalidateTag = vi.fn()
let mockUsersTable: any[] = []
let mockAuthUsersMap: Record<string, any> = {}
let mockAuthAdminError: Error | null = null
let mockRpcData: any = null
let mockRpcError: any = null
let mockClientThrow = false

const createChain = (table: string) => {
  const chain: any = {
    _userIds: null as any[] | null,
    select: vi.fn((_cols?: string, opts?: any) => {
      if (opts?.count === 'exact' && opts?.head) {
        // count head query
      }
      return chain
    }),
    eq: vi.fn((field: string, val: any) => {
      chain._eqField = field
      chain._eqVal = val
      return chain
    }),
    in: vi.fn((field: string, vals: any[]) => {
      if (field === 'id' || field === 'user_id') {
        chain._userIds = vals
      }
      return chain
    }),
    or: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn((start: number, end: number) => {
      if (table === 'users') {
        const page = mockUsersTable.slice(start, end + 1)
        return Promise.resolve({
          data: page,
          error: null,
          count: mockUsersTable.length,
        })
      }
      return Promise.resolve({
        data: [],
        error: null,
        count: 0,
      })
    }),
    insert: vi.fn(() => chain),
    update: vi.fn((payload: any) => {
      chain._updatePayload = payload
      return chain
    }),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: vi.fn(() => {
      if (table === 'users') {
        const u = mockUsersTable.find((row) => row.id === chain._eqVal)
        return Promise.resolve({ data: u || null, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
    then: (resolve: any) => {
      if (table === 'users') {
        let res = mockUsersTable
        if (chain._userIds) {
          res = mockUsersTable.filter((u) => chain._userIds.includes(u.id))
        }
        resolve({ data: res, error: null, count: res.length })
      } else if (table === 'email_queue') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'system_errors') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'user_lesson_progress') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'xp_events') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'capstone_submissions') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'certificates') {
        resolve({ data: [], error: null, count: 0 })
      } else if (table === 'badges' || table === 'user_badges') {
        resolve({ data: [], error: null, count: 0 })
      } else {
        resolve({ data: [], error: null, count: 0 })
      }
    },
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => {
    if (mockClientThrow) {
      throw new Error('Supabase service role client unavailable')
    }
    return {
      from: vi.fn((table: string) => createChain(table)),
      rpc: vi.fn(async (fn: string) => {
        if (fn === 'get_admin_dashboard_summary') {
          if (mockRpcError) return { data: null, error: mockRpcError }
          return { data: mockRpcData, error: null }
        }
        return { data: null, error: null }
      }),
      auth: {
        admin: {
          getUserById: vi.fn(async (userId: string) => {
            if (mockAuthAdminError) throw mockAuthAdminError
            const authUser = mockAuthUsersMap[userId]
            if (authUser) {
              return { data: { user: authUser }, error: null }
            }
            return { data: { user: null }, error: { message: 'User not found in Auth' } }
          }),
          listUsers: vi.fn(async () => {
            if (mockAuthAdminError) throw mockAuthAdminError
            return {
              data: { users: Object.values(mockAuthUsersMap) },
              error: null,
            }
          }),
        },
      },
    }
  }),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: any) => fn),
  revalidateTag: (...args: any[]) => mockRevalidateTag(...args),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(async () => ({
    authorized: true,
    userId: 'admin-1',
    email: 'admin@prodily.app',
  })),
  logAdminAction: vi.fn(async () => {}),
}))

describe('Phase 3 — Cache Invalidation, Verification State & Admin Correctness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsersTable = []
    mockAuthUsersMap = {}
    mockAuthAdminError = null
    mockRpcData = null
    mockRpcError = null
    mockClientThrow = false
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  describe('Testimonial Cache Invalidation', () => {
    it('calls revalidateTag with single argument "testimonials" on publish', async () => {
      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')

      const success = await FeedbackAdminService.moderateTestimonial(
        'admin-1',
        'admin@prodily.app',
        'test-item-1',
        'publish'
      )

      expect(success).toBe(true)
      expect(mockRevalidateTag).toHaveBeenCalledTimes(1)
      expect(mockRevalidateTag).toHaveBeenCalledWith('testimonials')
    })

    it('calls revalidateTag with single argument "testimonials" on unpublish', async () => {
      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')

      const success = await FeedbackAdminService.moderateTestimonial(
        'admin-1',
        'admin@prodily.app',
        'test-item-2',
        'unpublish'
      )

      expect(success).toBe(true)
      expect(mockRevalidateTag).toHaveBeenCalledWith('testimonials')
    })

    it('calls revalidateTag with single argument "testimonials" on edit and approve', async () => {
      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')

      const success = await FeedbackAdminService.moderateTestimonial(
        'admin-1',
        'admin@prodily.app',
        'test-item-3',
        'edit',
        'Updated great content!'
      )

      expect(success).toBe(true)
      expect(mockRevalidateTag).toHaveBeenCalledWith('testimonials')
    })
  })

  describe('User Email Verification State Resolution', () => {
    it('correctly attributes isVerified=true for verified user and isVerified=false for unverified user in getUsersOverview', async () => {
      mockUsersTable = [
        {
          id: 'usr-verified',
          email: 'verified@example.com',
          name: 'Verified Alice',
          username: 'alice',
          is_admin: false,
          created_at: '2026-08-01T00:00:00Z',
          total_xp: 500,
          level: 3,
          current_streak: 5,
        },
        {
          id: 'usr-unverified',
          email: 'unverified@example.com',
          name: 'Unverified Bob',
          username: 'bob',
          is_admin: false,
          created_at: '2026-08-05T00:00:00Z',
          total_xp: 100,
          level: 1,
          current_streak: 0,
        },
      ]

      mockAuthUsersMap = {
        'usr-verified': {
          id: 'usr-verified',
          email: 'verified@example.com',
          email_confirmed_at: '2026-08-01T00:05:00Z',
        },
        'usr-unverified': {
          id: 'usr-unverified',
          email: 'unverified@example.com',
          email_confirmed_at: null, // Unverified
        },
      }

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const result = await AdminConsoleService.getUsersOverview(10, '', {}, 1)

      expect(result.users).toHaveLength(2)

      const alice = result.users.find((u) => u.id === 'usr-verified')
      expect(alice).toBeDefined()
      expect(alice?.isVerified).toBe(true)
      expect(alice?.emailConfirmedAt).toBe('2026-08-01T00:05:00Z')

      const bob = result.users.find((u) => u.id === 'usr-unverified')
      expect(bob).toBeDefined()
      expect(bob?.isVerified).toBe(false)
      expect(bob?.emailConfirmedAt).toBeNull()
    })

    it('handles Auth lookup failure safely by marking isVerified=false and never claiming true', async () => {
      mockUsersTable = [
        {
          id: 'usr-lookup-fail',
          email: 'failed@example.com',
          name: 'Fail User',
          created_at: '2026-08-10T00:00:00Z',
        },
      ]
      mockAuthAdminError = new Error('Supabase Auth network timeout')

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const result = await AdminConsoleService.getUsersOverview(10, '', {}, 1)

      expect(result.users).toHaveLength(1)
      const user = result.users[0]
      expect(user.isVerified).toBe(false)
      expect(user.emailConfirmedAt).toBeNull()
    })

    it('does not bleed verification state between multiple users across pagination', async () => {
      mockUsersTable = [
        { id: 'usr-1', email: 'u1@test.com', name: 'User 1', created_at: '2026-08-01T00:00:00Z' },
        { id: 'usr-2', email: 'u2@test.com', name: 'User 2', created_at: '2026-08-02T00:00:00Z' },
        { id: 'usr-3', email: 'u3@test.com', name: 'User 3', created_at: '2026-08-03T00:00:00Z' },
      ]

      mockAuthUsersMap = {
        'usr-1': { id: 'usr-1', email_confirmed_at: '2026-08-01T01:00:00Z' },
        'usr-2': { id: 'usr-2', email_confirmed_at: null },
        'usr-3': { id: 'usr-3', email_confirmed_at: '2026-08-03T01:00:00Z' },
      }

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const result = await AdminConsoleService.getUsersOverview(10, '', {}, 1)

      expect(result.users.map((u) => ({ id: u.id, isVerified: u.isVerified }))).toEqual([
        { id: 'usr-1', isVerified: true },
        { id: 'usr-2', isVerified: false },
        { id: 'usr-3', isVerified: true },
      ])
    })

    it('returns isVerified=false for unconfirmed user in getUserDetailData without created_at fallback', async () => {
      mockUsersTable = [
        {
          id: 'usr-detail-unconfirmed',
          email: 'unconfirmed@example.com',
          name: 'Unconfirmed Detail User',
          created_at: '2026-08-10T12:00:00Z',
        },
      ]
      mockAuthUsersMap = {
        'usr-detail-unconfirmed': {
          id: 'usr-detail-unconfirmed',
          email: 'unconfirmed@example.com',
          email_confirmed_at: null,
        },
      }

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const detail = await AdminConsoleService.getUserDetailData('usr-detail-unconfirmed')

      expect(detail).not.toBeNull()
      expect(detail?.isVerified).toBe(false)
      expect(detail?.emailConfirmedAt).toBeNull()
      expect(detail?.account.verified).toBe(false)
    })
  })

  describe('Admin Dashboard and System Service Failure Hardening', () => {
    it('handles RPC success in getDashboardSummary', async () => {
      mockRpcData = {
        totalUsers: 150,
        activeLearners7d: 42,
        newSignups24h: 7,
        totalLessonsCompleted: 350,
        totalCapstonesSubmitted: 12,
        totalCertificatesIssued: 8,
        totalPublicPortfolios: 15,
        totalXpAwarded: 25000,
      }

      const { DashboardService } = await import('@/lib/admin/dashboard-service')
      const summary = await DashboardService.getDashboardSummary(true)

      expect(summary.totalUsers).toBe(150)
      expect(summary.activeLearners7d).toBe(42)
      expect(summary.newSignups24h).toBe(7)
      expect(summary.totalLessonsCompleted).toBe(350)
      expect(summary.totalXpAwarded).toBe(25000)
    })

    it('handles RPC failure and gracefully falls back to query counts in getDashboardSummary', async () => {
      mockRpcError = { message: 'function get_admin_dashboard_summary() does not exist' }
      mockUsersTable = [
        { id: 'usr-1', created_at: new Date().toISOString(), total_xp: 200 },
        { id: 'usr-2', created_at: new Date().toISOString(), total_xp: 300 },
      ]

      const { DashboardService } = await import('@/lib/admin/dashboard-service')
      const summary = await DashboardService.getDashboardSummary(true)

      expect(summary.totalUsers).toBe(2)
      expect(summary.systemHealth.status).toBe('healthy')
    })

    it('handles complete service role failure in getDashboardSummary without crashing', async () => {
      mockClientThrow = true

      const { DashboardService } = await import('@/lib/admin/dashboard-service')
      const summary = await DashboardService.getDashboardSummary(true)

      expect(summary).toBeDefined()
      expect(summary.totalUsers).toBe(0)
      expect(summary.systemHealth.status).toBe('down')
    })

    it('handles complete service role failure in getDashboardData without crashing', async () => {
      mockClientThrow = true

      const { DashboardService } = await import('@/lib/admin/dashboard-service')
      const data = await DashboardService.getDashboardData('30d', null, null, true)

      expect(data).toBeDefined()
      expect(data.kpis.totalUsers).toBe(0)
      expect(data.attention).toEqual([])
      expect(data.series).toEqual([])
    })

    it('handles service role failure in AdminConsoleService.getSystemHealth returning status=down', async () => {
      mockClientThrow = true

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const health = await AdminConsoleService.getSystemHealth()

      expect(health.status).toBe('down')
      expect(health.databaseLatencyMs).toBe(-1)
    })

    it('handles service role failure in AdminConsoleService.getConsoleShellContext returning systemOnline=false', async () => {
      mockClientThrow = true

      const { AdminConsoleService } = await import('@/lib/admin/service')
      const shellContext = await AdminConsoleService.getConsoleShellContext()

      expect(shellContext.systemOnline).toBe(false)
      expect(shellContext.databaseLatencyMs).toBeNull()
      expect(shellContext.attentionTotal).toBe(0)
    })
  })
})
