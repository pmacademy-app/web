/**
 * Security events on the auth routes: login, signup, resend-verification and the
 * Supabase send-email hook. Each refusal records its event type; the success path
 * records nothing. `recordSecurityEvent` is the vi.fn from vitest.setup.ts.
 */
import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { state } = vi.hoisted(() => ({
  state: {
    failKeys: [] as string[],
    allowSignups: true,
    turnstile: { success: true } as { success: boolean; code?: string },
    signIn: { ok: true },
    sendResult: { sent: true, id: 'msg-1' } as Record<string, unknown>,
  },
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async (key: string) =>
    state.failKeys.some((prefix) => key.startsWith(prefix))
      ? { success: false, remaining: 0, resetInMs: 60_000 }
      : { success: true, remaining: 4, resetInMs: 60_000 }
  ),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 4, resetInMs: 60_000 })),
}))

vi.mock('@/lib/settings/system-settings-service', () => ({
  SettingsService: {
    getProductSettings: vi.fn(async () => ({
      maintenanceMode: false,
      allowSignups: state.allowSignups,
      requireEmailVerification: false,
    })),
    isEmailVerificationRequired: vi.fn(async () => false),
  },
}))

vi.mock('@/lib/auth', () => ({
  SIGNUP_CONSENT_APP_METADATA_KEY: 'signup_consent',
  ensureUserProfile: vi.fn(async () => undefined),
  getAuthenticatedUserFromRequest: vi.fn(async () => null),
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: { getState: vi.fn(async () => ({ dailyLimit: 100 })) },
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => undefined),
  logErrorReport: vi.fn(async () => undefined),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: vi.fn(async () =>
        state.signIn.ok
          ? {
              data: {
                session: { access_token: 't', refresh_token: 'r', expires_in: 3600 },
                user: { id: 'u1', email: 'learner@example.com' },
              },
              error: null,
            }
          : { data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400 } }
      ),
      signUp: vi.fn(async () => ({ data: { user: { id: 'u1', identities: [{ id: '1' }] } }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      resend: vi.fn(async () => ({ data: {}, error: null })),
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })),
        updateUserById: vi.fn(async () => ({ data: {}, error: null })),
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) }) }),
      insert: () => ({ select: () => ({ single: vi.fn(async () => ({ data: { id: 'u1' }, error: null })) }) }),
    }),
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }),
}))

vi.mock('@/lib/security/turnstile', () => ({
  verifyTurnstileToken: vi.fn(async () => state.turnstile),
  evaluateSiteverifyBudget: vi.fn(async () => ({ success: true, resetInMs: 3_600_000 })),
}))

vi.mock('@/emails', () => ({
  renderEmailTemplate: vi.fn(async () => ({ html: '<p>x</p>', text: 'x', subject: 'Reset' })),
}))

vi.mock('@/lib/email-governance', () => ({
  sendGovernedEmail: vi.fn(async () => state.sendResult),
}))

import { recordSecurityEvent } from '@/lib/security/security-events'
import { POST as loginPOST } from '../../app/api/auth/login/route'
import { POST as signupPOST } from '../../app/api/auth/signup/route'
import { POST as resendPOST } from '../../app/api/auth/resend-verification/route'
import { POST as hookPOST } from '../../app/api/auth/send-email-hook/route'

const recorded = vi.mocked(recordSecurityEvent)
const types = () => recorded.mock.calls.map((call) => call[0])

function post(url: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.failKeys = []
  state.allowSignups = true
  state.turnstile = { success: true }
  state.signIn = { ok: true }
  state.sendResult = { sent: true, id: 'msg-1' }
  recorded.mockClear()
})

describe('POST /api/auth/login', () => {
  const body = { email: 'Learner@Example.com', password: 'hunter2222' }

  it('records login_rate_limited when a limiter refuses', async () => {
    state.failKeys = ['login_email:']
    const res = await loginPOST(post('https://prodily.app/api/auth/login', body))
    expect(res.status).toBe(429)
    expect(recorded).toHaveBeenCalledTimes(1)
    expect(recorded).toHaveBeenCalledWith('login_rate_limited', {
      ipBucket: '203.0.113.9',
      subject: 'learner@example.com',
      path: '/api/auth/login',
    })
  })

  it('records login_failed for a wrong password or unknown account', async () => {
    state.signIn = { ok: false }
    const res = await loginPOST(post('https://prodily.app/api/auth/login', body))
    expect(res.status).toBe(401)
    expect(types()).toEqual(['login_failed'])
    expect(recorded.mock.calls[0][1]).toMatchObject({ subject: 'learner@example.com' })
  })

  it('records nothing on a successful login', async () => {
    const res = await loginPOST(post('https://prodily.app/api/auth/login', body))
    expect(res.status).toBe(200)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/signup', () => {
  const body = {
    name: 'Test Learner',
    email: 'learner@example.com',
    password: 'hunter2222',
    turnstileToken: 'token',
    acceptedTerms: true,
    confirmedMinimumAge: true,
  }
  const url = 'https://prodily.app/api/auth/signup'

  it('records signup_blocked while signups are closed', async () => {
    state.allowSignups = false
    const res = await signupPOST(post(url, body))
    expect(res.status).toBe(403)
    expect(types()).toEqual(['signup_blocked'])
    expect(recorded.mock.calls[0][1]).toMatchObject({ subject: 'learner@example.com', path: '/api/auth/signup' })
  })

  it.each(['signup_ip:', 'signup_email:', 'signup_global'])('records signup_blocked when %s refuses', async (prefix) => {
    state.failKeys = [prefix]
    const res = await signupPOST(post(url, body))
    expect(res.status).toBe(429)
    expect(types()).toEqual(['signup_blocked'])
  })

  it('records turnstile_failed for a rejected token', async () => {
    state.turnstile = { success: false, code: 'CAPTCHA_FAILED' }
    const res = await signupPOST(post(url, body))
    expect(res.status).toBe(400)
    expect(types()).toEqual(['turnstile_failed'])
  })

  it('records nothing when Turnstile itself is unavailable', async () => {
    state.turnstile = { success: false, code: 'CAPTCHA_UNAVAILABLE' }
    const res = await signupPOST(post(url, body))
    expect(res.status).toBe(503)
    expect(recorded).not.toHaveBeenCalled()
  })

  it('records nothing once every gate passes', async () => {
    await signupPOST(post(url, body))
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/resend-verification', () => {
  const url = 'https://prodily.app/api/auth/resend-verification'

  it('records turnstile_failed for a missing token', async () => {
    const res = await resendPOST(post(url, { email: 'learner@example.com' }))
    expect(res.status).toBe(400)
    expect(types()).toEqual(['turnstile_failed'])
    expect(recorded.mock.calls[0][1]).toMatchObject({
      subject: 'learner@example.com',
      path: '/api/auth/resend-verification',
    })
  })

  it('records turnstile_failed for a rejected token', async () => {
    state.turnstile = { success: false, code: 'CAPTCHA_FAILED' }
    const res = await resendPOST(post(url, { email: 'learner@example.com', turnstileToken: 'bad' }))
    expect(res.status).toBe(400)
    expect(types()).toEqual(['turnstile_failed'])
  })

  it('records nothing on success', async () => {
    const res = await resendPOST(post(url, { email: 'learner@example.com', turnstileToken: 'ok' }))
    expect(res.status).toBe(200)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/send-email-hook', () => {
  const secretBytes = Buffer.from('security-events-hook-test-secret')
  const secret = `whsec_${secretBytes.toString('base64')}`

  function hookRequest(actionType: string, { sign = true } = {}) {
    const raw = JSON.stringify({
      user: { id: 'u1', email: 'Reset.Me@Example.com' },
      email_data: { email_action_type: actionType, token_hash: 'hash-1', redirect_to: 'https://prodily.app/reset-password' },
    })
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = sign
      ? crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${raw}`).digest('base64')
      : 'forged'
    return new NextRequest('https://prodily.app/api/auth/send-email-hook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
      body: raw,
    })
  }

  beforeEach(() => {
    process.env.SEND_EMAIL_HOOK_SECRET = secret
  })

  it('records email_hook_auth_failed for a bad signature', async () => {
    const res = await hookPOST(hookRequest('recovery', { sign: false }))
    expect(res.status).toBe(401)
    expect(types()).toEqual(['email_hook_auth_failed'])
    expect(recorded.mock.calls[0][1]).toEqual({ path: '/api/auth/send-email-hook' })
  })

  it('records password_reset_requested for a recovery email, keyed on the hook user email', async () => {
    const res = await hookPOST(hookRequest('recovery'))
    expect(res.status).toBe(200)
    expect(types()).toEqual(['password_reset_requested'])
    expect(recorded.mock.calls[0][1]).toEqual({ subject: 'Reset.Me@Example.com', path: '/api/auth/send-email-hook' })
  })

  it('records password_reset_rate_limited when governance refuses a recovery email', async () => {
    state.sendResult = { sent: false, blocked: 'recipient_rate_limited' }
    const res = await hookPOST(hookRequest('recovery'))
    expect(res.status).toBe(429)
    expect(types()).toEqual(['password_reset_requested', 'password_reset_rate_limited'])
  })

  it('does not count a deduplicated redelivery as rate limited', async () => {
    state.sendResult = { sent: false, blocked: 'duplicate' }
    const res = await hookPOST(hookRequest('recovery'))
    expect(res.status).toBe(200)
    expect(types()).toEqual(['password_reset_requested'])
  })

  it('records nothing for a signed signup verification email, even when rate limited', async () => {
    expect((await hookPOST(hookRequest('signup'))).status).toBe(200)
    state.sendResult = { sent: false, blocked: 'recipient_rate_limited' }
    expect((await hookPOST(hookRequest('signup'))).status).toBe(429)
    expect(recorded).not.toHaveBeenCalled()
  })
})
