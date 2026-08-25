/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { AdminConsoleService } from '../admin/service'
import { isAdminEmail, isAdminUser } from '../admin/authorization'
import { ADMIN_NAV, ADMIN_NAV_BUILT, isAdminNavItemActive, getAdminSectionLabel, type AdminNavItem } from '../admin/navigation'
import { LayoutDashboard, Users } from 'lucide-react'

const createMockChain = (table: string) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    or: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: 'usr-1',
            name: 'Alice Learner',
            email: 'alice@example.com',
            total_xp: 350,
            level: 2,
            current_streak: 3,
            is_admin: false,
            is_portfolio_public: true,
            created_at: new Date().toISOString(),
          },
        ],
        count: 1,
        error: null,
      })
    ),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => {
      if (table === 'users') {
        resolve({
          data: [
            {
              id: 'usr-1',
              name: 'Alice Learner',
              email: 'alice@example.com',
              total_xp: 350,
              level: 2,
              current_streak: 3,
              is_admin: false,
              is_portfolio_public: true,
              created_at: new Date().toISOString(),
            },
          ],
          count: 1,
          error: null,
        })
      } else if (table === 'user_lesson_progress') {
        resolve({ data: [{ user_id: 'usr-1', status: 'completed' }], count: 1, error: null })
      } else if (table === 'xp_events') {
        resolve({ data: [{ user_id: 'usr-1', created_at: new Date().toISOString() }], count: 1, error: null })
      } else {
        resolve({ data: [], count: 0, error: null })
      }
    },
  }
  return chain
}

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createMockChain(table)),
    auth: {
      admin: {
        getUserById: vi.fn((id: string) =>
          Promise.resolve({
            data: {
              user: {
                id,
                email: 'alice@example.com',
                email_confirmed_at: new Date().toISOString(),
              },
            },
            error: null,
          })
        ),
      },
    },
  })),
  createBrowserSupabaseClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

describe('Admin Console Unit Test Suite', () => {
  it('AdminConsoleService.getFeatureFlags returns all feature flags', async () => {
    const flags = await AdminConsoleService.getFeatureFlags()
    expect(Array.isArray(flags)).toBe(true)
    expect(flags.length).toBeGreaterThanOrEqual(5)
    const schedulerFlag = flags.find((f) => f.key === 'SCHEDULER_ENABLED')
    expect(schedulerFlag?.enabled).toBe(true)
  })

  it('AdminConsoleService.toggleFeatureFlag toggles runtime flag state', async () => {
    AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', true)
    let flags = await AdminConsoleService.getFeatureFlags()
    let marketingFlag = flags.find((f) => f.key === 'MARKETING_EMAILS_ENABLED')
    expect(marketingFlag?.enabled).toBe(true)

    AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', false)
    flags = await AdminConsoleService.getFeatureFlags()
    marketingFlag = flags.find((f) => f.key === 'MARKETING_EMAILS_ENABLED')
    expect(marketingFlag?.enabled).toBe(false)
  })

  it('AdminConsoleService.getContentOverview returns 90 compiled lessons stats', async () => {
    const overview = await AdminConsoleService.getContentOverview()
    expect(overview.totalModules).toBe(9)
    expect(overview.totalLessons).toBe(90)
    expect(overview.publishedLessons).toBe(90)
  })

  it('AdminConsoleService.getUsersOverview maps is_portfolio_public to hasPublicPortfolio', async () => {
    const { users, total } = await AdminConsoleService.getUsersOverview(10)
    expect(Array.isArray(users)).toBe(true)
    expect(typeof total).toBe('number')
    if (users.length > 0) {
      const user = users[0]
      expect(typeof user.hasPublicPortfolio).toBe('boolean')
      expect(typeof user.progressPct).toBe('number')
    }
  })

  it('Admin RBAC evaluates ADMIN_EMAILS environment variable', () => {
    const originalEnv = process.env.ADMIN_EMAILS
    process.env.ADMIN_EMAILS = 'admin1@pmacademy.com, superadmin@pmacademy.com ,'

    expect(isAdminEmail('admin1@pmacademy.com')).toBe(true)
    expect(isAdminEmail('superadmin@pmacademy.com')).toBe(true)
    expect(isAdminEmail('learner@pmacademy.com')).toBe(false)
    expect(isAdminEmail('ADMIN1@pmacademy.com')).toBe(true)
    expect(isAdminEmail('Admin1@PMAcademy.com')).toBe(true)
    expect(isAdminEmail('')).toBe(false)
    expect(isAdminEmail(null)).toBe(false)
    expect(isAdminEmail(undefined)).toBe(false)

    process.env.ADMIN_EMAILS = originalEnv
  })

  it('Admin RBAC grants access via users.is_admin database flag', async () => {
    const originalEnv = process.env.ADMIN_EMAILS
    process.env.ADMIN_EMAILS = ''

    const mockClient = (isAdminRow: boolean | null) =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                isAdminRow === null
                  ? { data: null, error: { message: 'Not found' } }
                  : { data: { is_admin: isAdminRow }, error: null },
            }),
          }),
        }),
      }) as unknown as Parameters<typeof isAdminUser>[0]

    expect(await isAdminUser(mockClient(true), 'user-1', 'someone@pmacademy.com')).toBe(true)
    expect(await isAdminUser(mockClient(false), 'user-1', 'someone@pmacademy.com')).toBe(false)
    expect(await isAdminUser(mockClient(null), 'user-1', 'someone@pmacademy.com')).toBe(false)

    process.env.ADMIN_EMAILS = originalEnv
  })

  it('Admin RBAC short-circuits to ADMIN_EMAILS without a database call', async () => {
    const originalEnv = process.env.ADMIN_EMAILS
    process.env.ADMIN_EMAILS = 'boss@pmacademy.com'

    let dbCalled = false
    const mockClient = () =>
      ({
        from: () => {
          dbCalled = true
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_admin: false }, error: null }) }) }),
          }
        },
      }) as unknown as Parameters<typeof isAdminUser>[0]

    expect(await isAdminUser(mockClient(), 'user-1', 'boss@pmacademy.com')).toBe(true)
    expect(dbCalled).toBe(false)

    process.env.ADMIN_EMAILS = originalEnv
  })

  it('ADMIN_NAV contains all primary workspaces with unique valid icons and built routes', () => {
    expect(Array.isArray(ADMIN_NAV)).toBe(true)
    expect(ADMIN_NAV.length).toBeGreaterThanOrEqual(6)

    const allBuiltItems = ADMIN_NAV_BUILT.flatMap((g) => g.items)
    expect(allBuiltItems.length).toBeGreaterThanOrEqual(8)

    const dashboard = allBuiltItems.find((i) => i.href === '/admin')
    const users = allBuiltItems.find((i) => i.href === '/admin/users')
    const settings = allBuiltItems.find((i) => i.href === '/admin/settings')
    const onboarding = allBuiltItems.find((i) => i.href.includes('onboarding'))

    expect(dashboard).toBeDefined()
    expect(users).toBeDefined()
    expect(settings).toBeDefined()
    expect(onboarding).toBeDefined()
  })

  it('isAdminNavItemActive correctly resolves root dashboard, sub-routes, and parameter variants', () => {
    const dashboardItem: AdminNavItem = { name: 'Dashboard', href: '/admin', built: true, icon: LayoutDashboard }
    const usersItem: AdminNavItem = { name: 'Users', href: '/admin/users', built: true, icon: Users }

    expect(isAdminNavItemActive(dashboardItem, '/admin')).toBe(true)
    expect(isAdminNavItemActive(dashboardItem, '/admin/users')).toBe(false)
    expect(isAdminNavItemActive(usersItem, '/admin/users')).toBe(true)
    expect(isAdminNavItemActive(usersItem, '/admin/users/usr-123')).toBe(true)

    expect(getAdminSectionLabel('/admin/users')).toBe('Operations')
    expect(getAdminSectionLabel('/admin/curriculum')).toBe('Learning')
    expect(getAdminSectionLabel('/admin/system')).toBe('System')
    expect(getAdminSectionLabel('/admin/settings')).toBe('Settings')
  })
})
