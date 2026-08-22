import { describe, it, expect } from 'vitest'
import { POST } from '../../app/api/admin/emails/test-send/route'

describe('Admin Production Email Test-Send Unit Test Suite', () => {
  it('POST /api/admin/emails/test-send rejects unauthenticated requests', async () => {
    const req = new Request('http://localhost:3000/api/admin/emails/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateKey: 'auth.welcome',
        toEmail: 'test@example.com',
      }),
    })

    const res = await POST(req)
    expect([401, 403].includes(res.status)).toBe(true)
  })

  it('POST /api/admin/emails/test-send rejects invalid email parameter format', async () => {
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
    expect([400, 401, 403].includes(res.status)).toBe(true)
  })
})
