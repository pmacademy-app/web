import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { SupabaseFake } from './helpers/supabase-fake'

const fake = new SupabaseFake()

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createServiceRoleClient: () => fake,
}))

import { GET, POST } from '../../app/api/email/unsubscribe/route'

const TOKEN = '6f1c2a9e-1111-4222-8333-944455556666'

function seed() {
  fake.clearAll()
  fake.seed('user_notification_preferences', [
    {
      user_id: 'usr_1',
      unsubscribe_token: TOKEN,
      marketing_email: true,
      marketing_in_app: true,
      learning_email: true,
      product_updates_email: true,
    },
  ])
  fake.seed('users', [{ id: 'usr_1', email: 'Learner@Example.com' }])
  fake.seed('email_suppressions', [])
}

function prefs() {
  return fake.getTableRows('user_notification_preferences')[0]
}

describe('Email Unsubscribe Route Unit Test Suite', () => {
  beforeEach(seed)

  it('GET /api/email/unsubscribe rejects request missing token parameter with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe?format=json')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Missing unsubscribe token')
  })

  it('GET /api/email/unsubscribe renders HTML error page on missing token when requested via browser', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const html = await res.text()
    expect(html).toContain('Missing Unsubscribe Token')
    expect(html).toContain('No unsubscribe token was provided')
  })

  it('GET /api/email/unsubscribe handles invalid/non-existent unsubscribe token with 404', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=non_existent_token_123&format=json')
    const res = await GET(req)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Invalid or expired unsubscribe token')
  })

  it('GET /api/email/unsubscribe renders HTML invalid link page for browser requests with invalid token', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=invalid_token_999')
    const res = await GET(req)
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).toContain('Invalid or Expired Link')
  })

  it('GET with a valid token renders a confirm form and writes nothing (link scanners are harmless)', async () => {
    const req = new NextRequest(`http://localhost:3000/api/email/unsubscribe?token=${TOKEN}`)
    const res = await GET(req)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<form method="post" action="/api/email/unsubscribe?token=' + TOKEN + '">')
    expect(html).toContain(`name="token" value="${TOKEN}"`)
    expect(html).toContain('<button type="submit">Unsubscribe</button>')
    expect(html).not.toContain(String.fromCharCode(0x2014))

    expect(prefs().marketing_email).toBe(true)
    expect(prefs().learning_email).toBe(true)
    expect(fake.getTableRows('email_suppressions')).toHaveLength(0)
  })

  it('GET with a valid token and format=json asks for a POST and writes nothing', async () => {
    const res = await GET(new NextRequest(`http://localhost:3000/api/email/unsubscribe?token=${TOKEN}&format=json`))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.confirmed).toBe(false)
    expect(prefs().learning_email).toBe(true)
  })

  it('POST from the confirm form (token in the body) unsubscribes and suppresses the address', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: TOKEN }).toString(),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('You have been unsubscribed')

    expect(prefs().marketing_email).toBe(false)
    expect(prefs().marketing_in_app).toBe(false)
    expect(prefs().learning_email).toBe(false)
    expect(prefs().product_updates_email).toBe(false)
    expect(fake.getTableRows('email_suppressions')).toEqual([
      expect.objectContaining({ email: 'learner@example.com', reason: 'user_unsubscribe' }),
    ])
  })

  it('POST RFC 8058 one-click (List-Unsubscribe=One-Click body, token in URL, cross-site) unsubscribes', async () => {
    const req = new NextRequest(`https://prodily.app/api/email/unsubscribe?token=${TOKEN}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://mail.google.com',
        'Sec-Fetch-Site': 'cross-site',
      },
      body: 'List-Unsubscribe=One-Click',
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(prefs().learning_email).toBe(false)
    expect(fake.getTableRows('email_suppressions')).toHaveLength(1)
  })

  it('POST without a token is rejected with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe?format=json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST with an unknown token is rejected with 404 and writes nothing', async () => {
    const req = new NextRequest('http://localhost:3000/api/email/unsubscribe?token=nope&format=json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
    expect(prefs().learning_email).toBe(true)
  })

  it('POST reports a failed preference update as 500 instead of "unsubscribed"', async () => {
    const original = fake.from.bind(fake)
    const spy = vi.spyOn(fake, 'from').mockImplementation((table: string) => {
      const builder = original(table)
      if (table === 'user_notification_preferences') {
        const realUpdate = builder.update.bind(builder)
        builder.update = (values) => {
          realUpdate(values)
          fake.forceError('user_notification_preferences', new Error('db down'))
          return builder
        }
      }
      return builder
    })

    const req = new NextRequest(`http://localhost:3000/api/email/unsubscribe?token=${TOKEN}&format=json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    })
    const res = await POST(req)
    spy.mockRestore()
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    expect(fake.getTableRows('email_suppressions')).toHaveLength(0)
  })

  it('a token lookup failure is a 500, not an "invalid link" 404', async () => {
    fake.forceError('user_notification_preferences', new Error('db down'))
    const res = await GET(new NextRequest(`http://localhost:3000/api/email/unsubscribe?token=${TOKEN}&format=json`))
    expect(res.status).toBe(500)
  })
})
