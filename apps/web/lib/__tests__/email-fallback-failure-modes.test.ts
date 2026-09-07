/**
 * Regression coverage for the 2026-09-06 signup-abuse incident's fallback risk:
 * `sendEmail()` previously fell back from Brevo to Resend (or vice versa) on ANY
 * failure, including quota exhaustion — which could silently move unbounded
 * volume onto the second provider instead of surfacing the real problem.
 * These tests pin the intended behavior: fallback fires for failures that mean the
 * provider cannot accept the message right now — timeout, network error, 5xx, and
 * capacity exhaustion (402/429) — but never for failures both providers would reject
 * identically (400 bad request / invalid recipient, 401/403 auth or config errors).
 *
 * The 402/429 cases were inverted on 2026-09-07; see the rationale on the
 * "Provider capacity exhaustion DOES trigger fallback" block below.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail } from '@/lib/email'

describe('Brevo <-> Resend fallback — transient-only, failure-aware', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_test_key'
    process.env.RESEND_API_KEY = 'resend_test_key'
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function mockFetchByHost(handlers: { brevo?: () => Promise<unknown> | unknown; resend?: () => Promise<unknown> | unknown }) {
    const calls: string[] = []
    const fn = vi.fn(async (url: string) => {
      if (url.includes('brevo.com')) {
        calls.push('brevo')
        return handlers.brevo ? handlers.brevo() : { ok: true, status: 200, json: async () => ({ messageId: 'b1' }) }
      }
      if (url.includes('resend.com')) {
        calls.push('resend')
        return handlers.resend ? handlers.resend() : { ok: true, status: 200, json: async () => ({ id: 'r1' }) }
      }
      return { ok: false, status: 404, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fn)
    return { fn, calls }
  }

  describe('Transient failures DO trigger fallback', () => {
    it('Brevo timeout -> falls back to Resend', async () => {
      const timeoutErr = new Error('The operation was aborted due to timeout')
      timeoutErr.name = 'TimeoutError'
      const { calls } = mockFetchByHost({
        brevo: () => { throw timeoutErr },
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })

    it('Brevo network failure (non-timeout exception) -> falls back to Resend', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => { throw new Error('fetch failed: ECONNRESET') },
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })

    it('Brevo 500 -> falls back to Resend', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 500, json: async () => ({ message: 'Internal Server Error' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })

    it('Brevo 503 -> falls back to Resend', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 503, json: async () => ({ message: 'Service Unavailable' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })
  })

  describe('Permanent failures do NOT trigger fallback', () => {
    it('Brevo 400 (invalid recipient / bad request) -> NO fallback', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 400, json: async () => ({ message: 'Invalid recipient email address' }) }),
      })

      const result = await sendEmail({ to: 'bad@@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo']) // Resend must never be called
      expect(result.success).toBe(false)
      expect(result.provider).toBe('brevo')
    })

    it('Brevo 401 (auth/config error) -> NO fallback', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 401, json: async () => ({ message: 'Key not found in account' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo'])
      expect(result.success).toBe(false)
    })

    it('Brevo 403 (auth/config error) -> NO fallback', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 403, json: async () => ({ message: 'Forbidden' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo'])
      expect(result.success).toBe(false)
    })

  })

  /**
   * INVERTED 2026-09-07 (audit B2).
   *
   * These two cases previously asserted that quota exhaustion must NOT fall back.
   * That conflated two separate concerns: "don't let a fallback amplify abusive
   * traffic" and "don't fail over when the provider is out of capacity". Provider
   * capacity exhaustion is precisely what a second provider exists for — and with
   * Brevo primary, a spent daily allowance takes signup verification and password
   * reset down while a healthy Resend key sits idle.
   *
   * Abuse containment stays where it belongs: the pre-dispatch daily quota gate in
   * `processEmailQueue` (see email-daily-quota-enforcement.test.ts), signup rate
   * limiting, and the per-provider circuit breaker that bounds failover volume.
   */
  describe('Provider capacity exhaustion DOES trigger fallback', () => {
    it('Brevo 429 (rate limit / quota exhaustion) -> falls back to Resend', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 429, json: async () => ({ message: 'Too many requests — daily quota exceeded' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })

    it('Brevo 402 (payment/quota exhaustion) -> falls back to Resend', async () => {
      const { calls } = mockFetchByHost({
        brevo: () => ({ ok: false, status: 402, json: async () => ({ message: 'Plan sending limit reached' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
    })
  })

  describe('Reverse direction: Resend as primary', () => {
    beforeEach(() => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'resend'
    })

    it('Resend 500 -> falls back to Brevo', async () => {
      const { calls } = mockFetchByHost({
        resend: () => ({ ok: false, status: 500, json: async () => ({ message: 'Internal error' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['resend', 'brevo'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('brevo')
    })

    it('Resend network failure -> falls back to Brevo', async () => {
      const { calls } = mockFetchByHost({
        resend: () => { throw new Error('network error: ENOTFOUND') },
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['resend', 'brevo'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('brevo')
    })

    it('Resend 401 (auth/config error) -> NO fallback', async () => {
      const { calls } = mockFetchByHost({
        resend: () => ({ ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['resend'])
      expect(result.success).toBe(false)
    })

    // INVERTED 2026-09-07 (audit B2) — symmetric counterpart of the Brevo 429 case.
    // Capacity exhaustion is failover-eligible in both directions; the classifier is
    // shared, so this must mirror "Provider capacity exhaustion DOES trigger fallback".
    it('Resend 429 (quota exhaustion) -> falls back to Brevo', async () => {
      const { calls } = mockFetchByHost({
        resend: () => ({ ok: false, status: 429, json: async () => ({ message: 'Rate limit exceeded' }) }),
      })

      const result = await sendEmail({ to: 'x@example.com', subject: 's', html: '<p>h</p>', text: 't' })

      expect(calls).toEqual(['resend', 'brevo'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('brevo')
    })
  })
})
