/**
 * Audit M8: in production a missing provider key, or a leftover *_SIMULATE flag, used
 * to return a fake successful send. Verification and password-reset emails were then
 * reported as delivered while nobody received them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrevoProvider } from '../notifications/providers/brevo-provider'
import { ResendProvider } from '../notifications/providers/resend-provider'
import { isLiveProduction, resolvePrimaryProvider } from '../notifications/config'

const KEYS = ['VERCEL_ENV', 'BREVO_API_KEY', 'RESEND_API_KEY', 'BREVO_SIMULATE', 'RESEND_SIMULATE', 'PRIMARY_EMAIL_PROVIDER'] as const
const saved: Record<string, string | undefined> = {}

const payload = {
  recipient: { email: 'learner@example.com' },
  channel: 'email' as const,
  templateKey: 'auth.verify_email',
  templateVersion: 1,
  variables: { subject: 'Verify', html: '<p>hi</p>' },
}

beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
  vi.restoreAllMocks()
})

describe('No fake email success in production', () => {
  it('detects production only from VERCEL_ENV=production', () => {
    expect(isLiveProduction()).toBe(false)
    process.env.VERCEL_ENV = 'preview'
    expect(isLiveProduction()).toBe(false)
    process.env.VERCEL_ENV = 'production'
    expect(isLiveProduction()).toBe(true)
  })

  it('Brevo fails, not simulates, when its key is missing in production', async () => {
    process.env.VERCEL_ENV = 'production'
    const result = await new BrevoProvider().send(payload)
    expect(result.success).toBe(false)
    expect(result.externalId).toBeUndefined()
  })

  it('Resend fails, not simulates, when its key is missing in production', async () => {
    process.env.VERCEL_ENV = 'production'
    const result = await new ResendProvider().send(payload)
    expect(result.success).toBe(false)
    expect(result.externalId).toBeUndefined()
  })

  it('still simulates outside production (local dev and tests)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const result = await new BrevoProvider().send(payload)
    expect(result.success).toBe(true)
    expect(result.externalId).toMatch(/^sim-brevo-/)
  })

  it('does not print the full recipient address when simulating', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await new ResendProvider().send(payload)
    expect(log.mock.calls.flat().join(' ')).not.toContain('learner@example.com')
  })

  it('in production, skips a named primary that has no key when the other is configured', () => {
    process.env.VERCEL_ENV = 'production'
    process.env.PRIMARY_EMAIL_PROVIDER = 'resend'
    process.env.BREVO_API_KEY = 'configured'
    expect(resolvePrimaryProvider()).toBe('brevo')
  })

  it('keeps the named primary outside production and when it is configured', () => {
    process.env.PRIMARY_EMAIL_PROVIDER = 'resend'
    process.env.BREVO_API_KEY = 'configured'
    expect(resolvePrimaryProvider()).toBe('resend')

    process.env.VERCEL_ENV = 'production'
    process.env.RESEND_API_KEY = 'configured'
    expect(resolvePrimaryProvider()).toBe('resend')
  })

  it('sendEmail fails in production when no provider key is set', async () => {
    process.env.VERCEL_ENV = 'production'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sendEmail } = await import('../email')
    const result = await sendEmail({ to: 'learner@example.com', subject: 'Verify', html: '<p>hi</p>', text: 'hi' })
    expect(result.success).toBe(false)
  })
})
