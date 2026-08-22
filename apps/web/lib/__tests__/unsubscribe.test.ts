import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../../app/api/email/unsubscribe/route'

describe('Email Unsubscribe Route Unit Test Suite', () => {
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
})
