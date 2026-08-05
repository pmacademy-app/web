process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key'

import assert from 'node:assert'
import { AdminConsoleService } from '../admin/service'
import { isAdminEmail, isAdminUser } from '../admin/authorization'

function runTest(name: string, fn: () => Promise<void> | void) {
  Promise.resolve(fn())
    .then(() => {
      console.log(`  ✓ ${name}`)
    })
    .catch((err) => {
      console.error(`  ✕ ${name}`)
      console.error(err)
      process.exit(1)
    })
}

console.log('🧪 Running Admin Console Unit Test Suite...\n')

runTest('AdminConsoleService.getFeatureFlags returns all feature flags', () => {
  const flags = AdminConsoleService.getFeatureFlags()
  assert(Array.isArray(flags))
  assert(flags.length >= 5)
  const schedulerFlag = flags.find((f) => f.key === 'SCHEDULER_ENABLED')
  assert.strictEqual(schedulerFlag?.enabled, true)
})

runTest('AdminConsoleService.toggleFeatureFlag toggles runtime flag state', () => {
  AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', true)
  let flags = AdminConsoleService.getFeatureFlags()
  let marketingFlag = flags.find((f) => f.key === 'MARKETING_EMAILS_ENABLED')
  assert.strictEqual(marketingFlag?.enabled, true)

  AdminConsoleService.toggleFeatureFlag('MARKETING_EMAILS_ENABLED', false)
  flags = AdminConsoleService.getFeatureFlags()
  marketingFlag = flags.find((f) => f.key === 'MARKETING_EMAILS_ENABLED')
  assert.strictEqual(marketingFlag?.enabled, false)
})

runTest('AdminConsoleService.getContentOverview returns 90 compiled lessons stats', async () => {
  const overview = await AdminConsoleService.getContentOverview()
  assert.strictEqual(overview.totalModules, 9)
  assert.strictEqual(overview.totalLessons, 90)
  assert.strictEqual(overview.publishedLessons, 90)
})

runTest('Admin RBAC evaluates ADMIN_EMAILS environment variable', () => {
  const originalEnv = process.env.ADMIN_EMAILS
  process.env.ADMIN_EMAILS = 'admin1@pmacademy.com, superadmin@pmacademy.com ,'

  // Comma-separated, whitespace-trimmed, empty entries filtered
  assert.strictEqual(isAdminEmail('admin1@pmacademy.com'), true)
  assert.strictEqual(isAdminEmail('superadmin@pmacademy.com'), true)
  assert.strictEqual(isAdminEmail('learner@pmacademy.com'), false)

  // Case-insensitive comparison
  assert.strictEqual(isAdminEmail('ADMIN1@pmacademy.com'), true)
  assert.strictEqual(isAdminEmail('Admin1@PMAcademy.com'), true)

  // Missing / empty emails are never admin
  assert.strictEqual(isAdminEmail(''), false)
  assert.strictEqual(isAdminEmail(null), false)
  assert.strictEqual(isAdminEmail(undefined), false)

  process.env.ADMIN_EMAILS = originalEnv
})

runTest('Admin RBAC grants access via users.is_admin database flag', async () => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  // DB flag true -> admin (even though email is not in ADMIN_EMAILS)
  assert.strictEqual(await isAdminUser(mockClient(true), 'user-1', 'someone@pmacademy.com'), true)
  // DB flag false -> not admin
  assert.strictEqual(await isAdminUser(mockClient(false), 'user-1', 'someone@pmacademy.com'), false)
  // No row -> not admin
  assert.strictEqual(await isAdminUser(mockClient(null), 'user-1', 'someone@pmacademy.com'), false)

  process.env.ADMIN_EMAILS = originalEnv
})

runTest('Admin RBAC short-circuits to ADMIN_EMAILS without a database call', async () => {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any

  assert.strictEqual(await isAdminUser(mockClient(), 'user-1', 'boss@pmacademy.com'), true)
  assert.strictEqual(dbCalled, false)

  process.env.ADMIN_EMAILS = originalEnv
})

console.log('\n✅ All Admin Console Unit Tests Passed Successfully!\n')
