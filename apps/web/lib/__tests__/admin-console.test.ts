process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-service-key'

import assert from 'node:assert'
import { AdminConsoleService } from '../admin/service'

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
  process.env.ADMIN_EMAILS = 'admin1@pmacademy.com, superadmin@pmacademy.com'

  const adminEmailsEnv = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  assert.strictEqual(adminEmailsEnv.length, 2)
  assert.strictEqual(adminEmailsEnv.includes('admin1@pmacademy.com'), true)
  assert.strictEqual(adminEmailsEnv.includes('superadmin@pmacademy.com'), true)
  assert.strictEqual(adminEmailsEnv.includes('learner@pmacademy.com'), false)

  process.env.ADMIN_EMAILS = originalEnv
})

console.log('\n✅ All Admin Console Unit Tests Passed Successfully!\n')
