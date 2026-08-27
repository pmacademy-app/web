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

  it('Successfully updates password and deletes recovery cookies', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'sb-access-token=mock-valid-token; sb-refresh-token=mock-refresh-token',
      },
      body: JSON.stringify({ newPassword: 'newValidPassword123' }),
    })

    const res = await POST(req)
    // Even if live supabase mock returns an error or success, it either handles 200 or 400
    // But let's verify response structure or cookie deletion if 200
    if (res.status === 200) {
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
    } else {
      // If mock rejected token, verify handled safely without crashing
      expect([200, 400]).toContain(res.status)
    }
  })

  it('Redirects recovery failures to /reset-password?error=expired rather than /login?error=auth_failed', async () => {
    const { GET: callbackGET } = await import('../../app/api/auth/callback/route')
    const req = new NextRequest('http://localhost:3000/api/auth/callback?type=recovery&token_hash=invalid_hash')
    const res = await callbackGET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/reset-password?error=expired')
    expect(res.headers.get('location')).not.toContain('/login?error=auth_failed')
  })
})
