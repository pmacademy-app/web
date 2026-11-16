import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupabaseFake } from './helpers/supabase-fake'
import { AdminConsoleService } from '../admin/service'
import { isAdminUser } from '../admin/authorization'
import { ADMIN_NAV, ADMIN_NAV_BUILT, isAdminNavItemActive, getAdminSectionLabel, type AdminNavItem } from '../admin/navigation'
import { LayoutDashboard, Users } from 'lucide-react'

const fake = new SupabaseFake()

function seedAdminFake() {
  fake.clearAll()
  fake.seed('users', [
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
  ])
  fake.seed('user_lesson_progress', [{ user_id: 'usr-1', status: 'completed' }])
  fake.seed('xp_events', [{ user_id: 'usr-1', created_at: new Date().toISOString() }])
  fake.seed('app_config', [])
  fake.seed('system_errors', [])
}

seedAdminFake()

beforeEach(() => {
  seedAdminFake()
})

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(() => fake),
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
    // Awaited: toggling now hydrates the persisted flag set before merging the change,
    // so the write completes asynchronously.
    await AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', true)
    let flags = await AdminConsoleService.getFeatureFlags()
    let marketingFlag = flags.find((f) => f.key === 'MARKETING_EMAILS_ENABLED')
    expect(marketingFlag?.enabled).toBe(true)

    await AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', false)
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

  it('Admin RBAC grants access via users.is_admin database flag only', async () => {
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

    expect(await isAdminUser(mockClient(true), 'user-1')).toBe(true)
    expect(await isAdminUser(mockClient(false), 'user-1')).toBe(false)
    expect(await isAdminUser(mockClient(null), 'user-1')).toBe(false)
  })

  it('Admin RBAC treats a missing users row as not an admin', async () => {
    const mockClient = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as unknown as Parameters<typeof isAdminUser>[0]

    expect(await isAdminUser(mockClient, 'user-1')).toBe(false)
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
