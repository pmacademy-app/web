import { describe, it, expect } from 'vitest'
import { AdminConsoleService } from '../admin/service'
import { isAdminEmail, isAdminUser } from '../admin/authorization'

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
})
