import assert from 'assert'
import { NextRequest } from 'next/server'
import { POST as contactPOST } from '../../app/api/contact/route'
import { GET as adminContactGET, PATCH as adminContactPATCH } from '../../app/api/admin/contact/route'
import { POST as webhookPOST } from '../../app/api/email/webhooks/route'

console.log('🧪 Running Contact Flow & Inbound Webhook Unit Test Suite...\n')

let passed = 0

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

async function executeContactTestSuite() {
  // 1. Input Validation Failure
  await runTest('/api/contact rejects missing required fields with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/contact', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'invalid', subject: '', message: '' }),
    })
    const res = await contactPOST(req)
    assert.strictEqual(res.status, 400)
    const data = await res.json()
    assert.ok(data.error, 'Response must return validation error string')
  })

  // 2. Admin GET Unauthorized
  await runTest('/api/admin/contact rejects unauthenticated requests with 401 or 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/contact')
    const res = await adminContactGET(req)
    assert.ok(res.status === 401 || res.status === 403)
  })

  // 3. Admin PATCH Unauthorized
  await runTest('/api/admin/contact PATCH rejects unauthenticated requests with 401 or 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/contact', {
      method: 'PATCH',
      body: JSON.stringify({ messageId: 'msg-123', status: 'replied' }),
    })
    const res = await adminContactPATCH(req)
    assert.ok(res.status === 401 || res.status === 403)
  })

  // 4. Rate Limiting Check
  await runTest('/api/contact rate limits excessive requests from single IP/key', async () => {
    const payload = {
      name: 'Rate Tester',
      email: 'rate@example.com',
      subject: 'Rate Limit Test',
      category: 'general',
      message: 'Testing rate limit threshold',
    }

    let rateLimited = false
    for (let i = 0; i < 6; i++) {
      const req = new NextRequest('http://localhost:3000/api/contact', {
        method: 'POST',
        headers: { 'x-forwarded-for': '192.168.1.99' },
        body: JSON.stringify(payload),
      })
      const res = await contactPOST(req)
      if (res.status === 429) {
        rateLimited = true
        break
      }
    }
    assert.strictEqual(rateLimited, true, 'Subsequent attempts beyond threshold should trigger HTTP 429')
  })

  // 5. Resend Inbound Webhook Handling
  await runTest('/api/email/webhooks processes email.received event payload', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const payload = {
      type: 'email.received',
      data: {
        email_id: 'em_test_123',
        from: 'Alice <alice@example.com>',
        to: ['hello@prodily.adityagangwani.me'],
        subject: 'Inbound Webhook Test Inquiry',
        text: 'Hello PM Academy support team!',
      },
    }
    const req = new NextRequest('http://localhost:3000/api/email/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const res = await webhookPOST(req)
    assert.strictEqual(res.status, 200)
    const data = await res.json()
    assert.strictEqual(data.success, true)
    assert.strictEqual(data.processed, true)
  })

  console.log(`\n✅ All ${passed} Contact Flow & Webhook Unit Tests Passed Successfully!\n`)
}

void executeContactTestSuite()
