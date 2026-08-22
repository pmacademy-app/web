import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../../app/api/auth/update-password/route'

describe('Password Update Endpoint Security & Functional Unit Tests', () => {
  it('Rejects non-JSON Content-Type with 415', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'newPassword=123456',
    })
    const res = await POST(req)
    expect(res.status).toBe(415)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Unsupported Content-Type. Expected application/json')
  })

  it('Rejects untrusted Origin header with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker-site.com',
      },
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Forbidden: Untrusted Origin')
  })

  it('Rejects short password (< 6 chars) with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: '123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Password must be at least 6 characters.')
  })

  it('Rejects request without sb-access-token cookie with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newPassword: 'validPassword123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('No active recovery session found. Please request a new password reset link.')
  })
})
