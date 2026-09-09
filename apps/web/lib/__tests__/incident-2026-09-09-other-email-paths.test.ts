/**
 * TESTS 19 and 20 — the endpoints an attacker moves to once signup is protected.
 *
 * `/api/auth/resend-verification` and the password-reset flow both call Supabase Auth,
 * which fires the GoTrue send-email hook, which spends provider credit. Before this
 * change resend-verification had exactly one control: a 60-second throttle keyed on
 * the email address. Rotating addresses gave a fresh 60-second bucket for every one of
 * them, so it was an independent, unmetered way to burn the same allowance that the
 * signup route had just been protected from.
 *
 * The waitlist endpoint had it worse: a process-local `Map` keyed on the leftmost
 * `X-Forwarded-For` value, which on serverless rarely survives long enough to deny
 * anything at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockEvaluate = vi.fn(async (_key: string, _opts: Record<string, unknown>) => ({
  success: true,
  remaining: 5,
  resetInMs: 60_000,
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (...a: [string, Record<string, unknown>]) => mockEvaluate(...a),
  evaluateRateLimit: (...a: [string, Record<string, unknown>]) => mockEvaluate(...a),
}))

const authResend = vi.fn(async () => ({ error: null as { message?: string } | null }))

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null } })),
      resend: authResend,
    },
  }),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(),
  logErrorReport: vi.fn(),
}))

import { POST as resendPOST } from '../../app/api/auth/resend-verification/route'

function resendRequest(email: string, headers: Record<string, string> = {}) {
  return new NextRequest('https://prodily.app/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email }),
  })
}

describe('Incident 2026-09-09 — resend-verification abuse controls', () => {
  beforeEach(() => {
    mockEvaluate.mockClear()
    mockEvaluate.mockImplementation(async () => ({ success: true, remaining: 5, resetInMs: 60_000 }))
    authResend.mockClear()
    authResend.mockImplementation(async () => ({ error: null }))
  })

  it('evaluates a per-email, a per-IP and a platform-wide budget, all fail-closed', async () => {
    await resendPOST(resendRequest('learner@example.com', { 'x-forwarded-for': '203.0.113.10' }))

    const keys = mockEvaluate.mock.calls.map((c) => c[0] as string)
    expect(keys.some((k) => k.startsWith('verify_resend:'))).toBe(true)
    expect(keys.some((k) => k.startsWith('verify_resend_ip:'))).toBe(true)
    expect(keys).toContain('verify_resend_global')

    for (const [, opts] of mockEvaluate.mock.calls) {
      expect((opts as { failClosed?: boolean }).failClosed).toBe(true)
    }
  })

  it('keys the IP budget on the trusted address, not the spoofable leftmost hop', async () => {
    await resendPOST(
      resendRequest('learner@example.com', { 'x-forwarded-for': '1.2.3.4, 203.0.113.10' })
    )

    const ipKey = mockEvaluate.mock.calls.map((c) => c[0] as string).find((k) => k.startsWith('verify_resend_ip:'))
    expect(ipKey).toBe('verify_resend_ip:203.0.113.10')
  })

  it('rotating email addresses cannot bypass the per-IP budget', async () => {
    let ipCalls = 0
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key.startsWith('verify_resend_ip:')) {
        ipCalls++
        return ipCalls <= 3
          ? { success: true, remaining: 3 - ipCalls, resetInMs: 3_600_000 }
          : { success: false, remaining: 0, resetInMs: 3_600_000 }
      }
      return { success: true, remaining: 9, resetInMs: 60_000 }
    })

    const statuses: number[] = []
    for (let i = 0; i < 5; i++) {
      const res = await resendPOST(
        resendRequest(`rotate${i}@example.com`, { 'x-forwarded-for': '203.0.113.10' })
      )
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
    // Every refusal happened before Supabase Auth was asked to send anything.
    expect(authResend).toHaveBeenCalledTimes(3)
  })

  it('rotating IPs cannot bypass the platform-wide ceiling', async () => {
    let globalCalls = 0
    mockEvaluate.mockImplementation(async (key: string) => {
      if (key === 'verify_resend_global') {
        globalCalls++
        return globalCalls <= 2
          ? { success: true, remaining: 2 - globalCalls, resetInMs: 3_600_000 }
          : { success: false, remaining: 0, resetInMs: 3_600_000 }
      }
      return { success: true, remaining: 9, resetInMs: 60_000 }
    })

    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await resendPOST(
        resendRequest(`x${i}@example.com`, { 'x-forwarded-for': `198.51.100.${i + 1}` })
      )
      statuses.push(res.status)
    }

    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
    expect(authResend).toHaveBeenCalledTimes(2)
  })

  it('a throttled request never reaches Supabase Auth, so it costs nothing', async () => {
    mockEvaluate.mockImplementation(async () => ({ success: false, remaining: 0, resetInMs: 60_000 }))

    const res = await resendPOST(resendRequest('learner@example.com'))

    expect(res.status).toBe(429)
    expect(authResend).not.toHaveBeenCalled()
  })

  it('keeps the non-enumerating success response for an allowed request', async () => {
    const res = await resendPOST(resendRequest('learner@example.com'))
    const json = await res.json()

    expect(res.status).toBe(200)
    // Same answer whether or not an unverified account exists for the address.
    expect(json.message).toMatch(/if an unverified account exists/i)
  })
})
