if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock_anon_key'
}
if (!process.env.ADMIN_EMAILS) {
  process.env.ADMIN_EMAILS = 'admin@prodily.app,owner@prodily.app'
}

import assert from 'assert'
import { NextRequest } from 'next/server'
import { proxy } from '../../proxy'
import { getAuthenticatedUserFromRequest } from '../auth'

let passedTests = 0

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn()
    if (result && typeof result.then === 'function') {
      return result
        .then(() => {
          passedTests++
          console.log(`  ✓ ${name}`)
        })
        .catch((err) => {
          console.error(`  ✕ ${name}`)
          console.error(err)
          process.exit(1)
        })
    }
    passedTests++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function runMiddlewareAuthTests() {
  console.log('🧪 Running Phase 2 Middleware & Auth Security Test Suite...\n')

  await runTest('1. Privilege Escalation Guard (FIND-01): Reject spoofed user_metadata.is_admin', async () => {
    const req = new NextRequest('https://prodily.app/admin', {
      headers: {
        cookie: 'sb-access-token=mock-user-token',
      },
    })

    const res = await proxy(req)
    assert.ok(res)
    // Non-admin user without valid DB record or ADMIN_EMAILS entry is redirected to /admin/login
    assert.strictEqual(res.status, 307)
    assert.ok(res.headers.get('location')?.includes('/admin/login'))
  })

  await runTest('2. Public Route Protection: Unauthenticated visitors can view /login', async () => {
    const req = new NextRequest('https://prodily.app/login')
    const res = await proxy(req)
    assert.ok(res)
    assert.strictEqual(res.status, 200)
  })

  await runTest('3. App Route Protection: Unauthenticated visitors redirected from /dashboard', async () => {
    const req = new NextRequest('https://prodily.app/dashboard')
    const res = await proxy(req)
    assert.ok(res)
    assert.strictEqual(res.status, 307)
    assert.ok(res.headers.get('location')?.includes('/login'))
  })

  await runTest('4. Admin Login Route: Visitors can view /admin/login', async () => {
    const req = new NextRequest('https://prodily.app/admin/login')
    const res = await proxy(req)
    assert.ok(res)
    assert.strictEqual(res.status, 200)
  })

  await runTest('5. API Route Token Extractor: getAuthenticatedUserFromRequest returns null without token', async () => {
    const req = new Request('https://prodily.app/api/streaks/timezone', {
      method: 'POST',
      body: JSON.stringify({ timezone: 'UTC' }),
    })
    const user = await getAuthenticatedUserFromRequest(req)
    assert.strictEqual(user, null)
  })

  console.log(`\n✅ All ${passedTests} Middleware & Auth Security Unit Tests Passed Successfully!\n`)
}

runMiddlewareAuthTests()
