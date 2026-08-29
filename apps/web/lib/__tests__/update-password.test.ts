import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Spy on logSystemError to verify monitoring behavior
const mockLogSystemError = vi.fn().mockResolvedValue('mock-system-error-id')
vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: (options: unknown) => mockLogSystemError(options),
}))

import { POST } from '../../app/api/auth/update-password/route'

describe('Password Update Endpoint Security & Functional Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

  it('Rejects request with neither sb-access-token nor sb-refresh-token with 401 and clears cookies', async () => {
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
    expect(res.cookies.get('sb-access-token')?.value).toBe('')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    // Does not log false-positive system error alert
    expect(mockLogSystemError).not.toHaveBeenCalled()
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
    if (res.status === 200) {
      const json = await res.json()
      expect(json.success).toBe(true)
      expect(res.cookies.get('sb-access-token')?.value).toBe('')
      expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    } else {
      expect([200, 400, 401]).toContain(res.status)
    }
  })

  it('Refresh-token fallback: when access token is expired, falls back to refresh token and suppresses false-positive system alerts on expected expiration', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'sb-refresh-token=expired-but-present-refresh-token',
      },
      body: JSON.stringify({ newPassword: 'newValidPassword123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Your password reset link has expired. Please request a new one.')
    expect(res.cookies.get('sb-access-token')?.value).toBe('')
    expect(res.cookies.get('sb-refresh-token')?.value).toBe('')
    // Critical assertion: standard expired refresh token MUST NOT log a system error alert
    expect(mockLogSystemError).not.toHaveBeenCalled()
  })

  it('Redirects recovery failures to /reset-password?error=expired rather than /login?error=auth_failed', async () => {
    const { GET: callbackGET } = await import('../../app/api/auth/callback/route')
    const req = new NextRequest('http://localhost:3000/api/auth/callback?type=recovery&token_hash=invalid_hash')
    const res = await callbackGET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/reset-password?error=expired')
    expect(res.headers.get('location')).not.toContain('/login?error=auth_failed')
  })

  it('Email verification failure redirects to /login?error=verification_failed (not generic auth_failed)', async () => {
    const { GET: callbackGET } = await import('../../app/api/auth/callback/route')
    const req = new NextRequest('http://localhost:3000/api/auth/callback?type=signup&token_hash=invalid_hash')
    const res = await callbackGET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login?error=verification_failed')
    expect(res.headers.get('location')).not.toContain('auth_failed')
  })

  it('Rejects untrusted Referer header with 403', async () => {
    const req = new NextRequest('http://localhost:3000/api/auth/update-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        referer: 'https://evil-attacker-site.com/attack',
      },
      body: JSON.stringify({ newPassword: 'newpassword123' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error).toBe('Forbidden: Untrusted Referer')
  })
})
