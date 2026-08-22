import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as contactPOST } from '../../app/api/contact/route'
import { GET as adminContactGET, PATCH as adminContactPATCH } from '../../app/api/admin/contact/route'
import { POST as webhookPOST } from '../../app/api/email/webhooks/route'

describe('Contact Flow & Inbound Webhook Unit Test Suite', () => {
  it('/api/contact rejects missing required fields with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/contact', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'invalid', subject: '', message: '' }),
    })
    const res = await contactPOST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeDefined()
  })

  it('/api/admin/contact rejects unauthenticated requests with 401 or 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/contact')
    const res = await adminContactGET(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('/api/admin/contact PATCH rejects unauthenticated requests with 401 or 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/contact', {
      method: 'PATCH',
      body: JSON.stringify({ messageId: 'msg-123', status: 'replied' }),
    })
    const res = await adminContactPATCH(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('/api/contact rate limits excessive requests from single IP/key', async () => {
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
    expect(rateLimited).toBe(true)
  })

  it('/api/email/webhooks processes email.received event payload', async () => {
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
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.processed).toBe(true)
  })
})
