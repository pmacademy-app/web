/**
 * Security review 2026-11 (H1, L4, L8): auth email must not be blockable through a
 * bucket an attacker can fill, and the send-email hook must fail closed and answer
 * generically.
 *
 * H1: the hook is called by Supabase Auth's servers, so the request IP is Supabase's
 * and every auth email used to share one 15/hour IP bucket, plus one platform-wide
 * aggregate shared with the public contact form. Filling either blocked every
 * verification and password-reset email.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

type LimitResult = { success: boolean; remaining: number; resetInMs: number }

function setupGateway(options: { limiter?: (key: string) => LimitResult } = {}) {
  const limiterKeys: string[] = []
  const sends: Array<Record<string, unknown>> = []

  vi.doMock('@/lib/notifications/feature-flags/service', () => ({
    globalFeatureFlagService: { isEnabledAsync: vi.fn(async () => true), isEnabled: vi.fn(() => true) },
  }))
  vi.doMock('@/lib/notifications/automations/service', () => ({
    EmailAutomationsService: { getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 100 })) },
  }))
  vi.doMock('@/lib/rate-limit', () => ({
    evaluatePersistentRateLimit: vi.fn(async (key: string) => {
      limiterKeys.push(key)
      return options.limiter ? options.limiter(key) : { success: true, remaining: 5, resetInMs: 0 }
    }),
  }))
  vi.doMock('@/lib/supabase', () => ({
    createServiceRoleClient: () => ({
      // claim_email_send and reserve_provider_email_quota both succeed.
      rpc: async () => ({ data: true, error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
    }),
  }))
  vi.doMock('@/lib/email', () => ({
    maskEmail: (e: string) => `***@${String(e).split('@')[1] ?? 'x'}`,
    sendEmail: vi.fn(async (args: Record<string, unknown>) => {
      sends.push(args)
      return { success: true, provider: 'brevo', id: 'b-1', statusCode: 200 }
    }),
  }))
  return { limiterKeys, sends }
}

const base = { subject: 's', html: '<p>s</p>', text: 's' }

describe('H1: governed gateway aggregate buckets are split by purpose group', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.doUnmock('@/lib/notifications/feature-flags/service')
    vi.doUnmock('@/lib/notifications/automations/service')
    vi.doUnmock('@/lib/rate-limit')
    vi.doUnmock('@/lib/supabase')
    vi.doUnmock('@/lib/email')
  })

  it('maps each purpose to its own aggregate key', async () => {
    const { aggregateBucketKey } = await import('../email-governance')
    expect(aggregateBucketKey('auth.verify_email')).toBe('email_global:auth_signup')
    expect(aggregateBucketKey('auth.invite')).toBe('email_global:auth_signup')
    expect(aggregateBucketKey('auth.password_reset')).toBe('email_global:auth_recovery')
    expect(aggregateBucketKey('auth.email_change_verify')).toBe('email_global:auth_recovery')
    expect(aggregateBucketKey('auth.reauthentication')).toBe('email_global:auth_recovery')
    expect(aggregateBucketKey('contact.acknowledgement')).toBe('email_global:contact')
    expect(aggregateBucketKey('support.inbound_forward')).toBe('email_global:support_inbound')
  })

  it('sizes auth buckets at an eighth of the daily allowance per hour, with a floor', async () => {
    const { aggregateHourlyCeiling } = await import('../email-governance')
    expect(aggregateHourlyCeiling('auth.password_reset', 100)).toBe(20)
    expect(aggregateHourlyCeiling('auth.verify_email', 300)).toBe(38)
    expect(aggregateHourlyCeiling('auth.verify_email', 0)).toBe(20)
    expect(aggregateHourlyCeiling('contact.acknowledgement', 100)).toBe(10)
    expect(aggregateHourlyCeiling('contact.acknowledgement', 480)).toBe(20)
  })

  it('a spent contact bucket does not block a password reset', async () => {
    const { sends } = setupGateway({
      limiter: (key) =>
        key === 'email_global:contact' || key === 'email_global:auth_signup'
          ? { success: false, remaining: 0, resetInMs: 3_600_000 }
          : { success: true, remaining: 5, resetInMs: 0 },
    })
    const { sendGovernedEmail } = await import('../email-governance')

    const reset = await sendGovernedEmail({
      ...base,
      purpose: 'auth.password_reset',
      to: 'victim@example.com',
      idempotencyKey: 'auth:u1:recovery:x',
    })
    expect(reset.sent).toBe(true)
    expect(sends).toHaveLength(1)

    const contact = await sendGovernedEmail({
      ...base,
      purpose: 'contact.acknowledgement',
      to: 'support@example.com',
      idempotencyKey: 'contact:1',
    })
    expect(contact.sent).toBe(false)
    expect(contact.blocked).toBe('rate_limited_aggregate')
  })

  it('keeps the per-recipient limit for auth mail', async () => {
    setupGateway({
      limiter: (key) =>
        key.startsWith('email_to:auth.password_reset:')
          ? { success: false, remaining: 0, resetInMs: 3_600_000 }
          : { success: true, remaining: 5, resetInMs: 0 },
    })
    const { sendGovernedEmail } = await import('../email-governance')
    const result = await sendGovernedEmail({
      ...base,
      purpose: 'auth.password_reset',
      to: 'Victim@Example.com',
      idempotencyKey: 'auth:u1:recovery:y',
    })
    expect(result.blocked).toBe('rate_limited_recipient')
  })

  it('never consults an IP bucket when no ipBucket is passed', async () => {
    const { limiterKeys } = setupGateway()
    const { sendGovernedEmail } = await import('../email-governance')
    await sendGovernedEmail({ ...base, purpose: 'auth.verify_email', to: 'a@example.com', idempotencyKey: 'k1' })
    expect(limiterKeys.some((k) => k.startsWith('email_ip:'))).toBe(false)
    expect(limiterKeys).toContain('email_global:auth_signup')
    expect(limiterKeys).not.toContain('email_global:governed')
  })
})

describe('send-email hook (H1, L4, L8)', () => {
  const originalEnv = { ...process.env }
  const governed = vi.fn()
  const render = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    governed.mockReset()
    render.mockReset()
    governed.mockResolvedValue({ sent: true, provider: 'brevo', id: 'b-1' })
    render.mockResolvedValue({ html: '<p>x</p>', text: 'x', subject: 'Verify' })
    vi.doMock('@/lib/email-governance', () => ({ sendGovernedEmail: governed }))
    vi.doMock('@/emails', () => ({ renderEmailTemplate: render }))
    process.env = { ...originalEnv }
    delete process.env.SEND_EMAIL_HOOK_SECRET
  })

  afterEach(() => {
    vi.doUnmock('@/lib/email-governance')
    vi.doUnmock('@/emails')
    process.env = { ...originalEnv }
  })

  const payload = {
    user: { id: 'usr-1', email: 'learner@example.com', user_metadata: { full_name: 'Learner' } },
    email_data: { email_action_type: 'recovery', token_hash: 'genuine_hash' },
  }

  function hookRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('https://prodily.app/api/auth/send-email-hook', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.7', 'x-real-ip': '203.0.113.7', ...headers },
      body: JSON.stringify(body),
    })
  }

  it('H1: sends through governance without an IP bucket', async () => {
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    const res = await POST(hookRequest(payload))
    expect(res.status).toBe(200)
    expect(governed).toHaveBeenCalledTimes(1)
    const args = governed.mock.calls[0][0] as Record<string, unknown>
    expect(args.purpose).toBe('auth.password_reset')
    expect('ipBucket' in args).toBe(false)
  })

  for (const env of ['production', 'staging', undefined]) {
    it(`L4: rejects unsigned calls when the secret is unset and NODE_ENV is ${String(env)}`, async () => {
      if (env === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV
      else (process.env as Record<string, string>).NODE_ENV = env
      const { POST } = await import('../../app/api/auth/send-email-hook/route')
      const res = await POST(hookRequest(payload))
      expect(res.status).toBe(401)
      expect(governed).not.toHaveBeenCalled()
    })
  }

  it('L4: still allows unsigned calls in development', async () => {
    ;(process.env as Record<string, string>).NODE_ENV = 'development'
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    const res = await POST(hookRequest(payload))
    expect(res.status).toBe(200)
  })

  it('L4: a configured secret still verifies a correctly signed request', async () => {
    const secret = 'whsec_' + Buffer.from('hook-secret-for-tests').toString('base64')
    process.env.SEND_EMAIL_HOOK_SECRET = secret
    const body = JSON.stringify(payload)
    const id = 'msg_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = crypto
      .createHmac('sha256', Buffer.from('hook-secret-for-tests'))
      .update(`${id}.${ts}.${body}`)
      .digest('base64')
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    const res = await POST(
      new NextRequest('https://prodily.app/api/auth/send-email-hook', {
        method: 'POST',
        headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` },
        body,
      })
    )
    expect(res.status).toBe(200)
  })

  it('L8: a template failure returns generic text', async () => {
    render.mockRejectedValue(new Error('relation "notification_templates" does not exist at /srv/app'))
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    const res = await POST(hookRequest(payload))
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).not.toContain('notification_templates')
    expect(text).not.toContain('/srv/app')
    expect(JSON.parse(text).error).toBe('Email could not be prepared')
  })

  it('L8: a governance block does not reveal which control refused', async () => {
    governed.mockResolvedValue({ sent: false, blocked: 'rate_limited_aggregate' })
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    const res = await POST(hookRequest(payload))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json).toEqual({ error: 'Email temporarily unavailable' })
  })

  it('M3: the emailed link carries the genuine token even when redirect_to smuggles another', async () => {
    const { POST } = await import('../../app/api/auth/send-email-hook/route')
    await POST(
      hookRequest({
        ...payload,
        email_data: {
          email_action_type: 'recovery',
          token_hash: 'genuine_hash',
          redirect_to: 'https://prodily.app/api/auth/callback?token_hash=attacker_hash&type=magiclink&next=/dashboard',
        },
      })
    )
    const vars = render.mock.calls[0][1] as Record<string, string>
    const url = new URL(vars.resetUrl)
    expect(url.searchParams.get('token_hash')).toBe('genuine_hash')
    expect(url.searchParams.get('type')).toBe('recovery')
    expect(vars.resetUrl).not.toContain('attacker_hash')
  })
})
