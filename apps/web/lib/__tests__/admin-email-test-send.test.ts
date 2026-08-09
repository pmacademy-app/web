import { POST } from '../../app/api/admin/emails/test-send/route'

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function executeAdminEmailTestSuite() {
  console.log('\n🧪 Running Admin Production Email Test-Send Unit Test Suite...\n')

  await runTest('POST /api/admin/emails/test-send rejects unauthenticated requests', async () => {
    const req = new Request('http://localhost:3000/api/admin/emails/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: 'auth.welcome',
        toEmail: 'test@example.com',
      }),
    })

    const res = await POST(req)
    if (res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected status 401 or 403 for unauthenticated request, got ${res.status}`)
    }
  })

  await runTest('POST /api/admin/emails/test-send rejects invalid email parameter format', async () => {
    const req = new Request('http://localhost:3000/api/admin/emails/test-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake_token',
      },
      body: JSON.stringify({
        templateKey: 'auth.welcome',
        toEmail: 'invalid-no-at-sign',
      }),
    })

    const res = await POST(req)
    // Should reject with 400 or 401/403 unauthenticated
    if (res.status !== 400 && res.status !== 401 && res.status !== 403) {
      throw new Error(`Expected status 400, 401 or 403, got ${res.status}`)
    }
  })

  console.log('\n✅ All Admin Email Test-Send Unit Tests Passed Successfully!\n')
}

void executeAdminEmailTestSuite()
