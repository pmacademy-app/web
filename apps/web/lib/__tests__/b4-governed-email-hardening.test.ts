/**
 * Batch B4 — Governed Email Egress & Transport Unification Tests
 *
 * Requirements:
 * - I-04-B2: EMAIL_ENABLED kill switch enforced in direct sendEmail() transport with isCritical bypass.
 * - I-04-B4: Direct sendEmail() routes through canonical provider registry (sendEmailWithFailover).
 * - I-04-B7: Bounded timeouts (EMAIL_HTTP_TIMEOUT_MS) across raw provider calls (automations, webhooks).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail } from '@/lib/email'
import { EMAIL_HTTP_TIMEOUT_MS } from '@/lib/notifications/config'
import { globalFeatureFlagService } from '@/lib/notifications/feature-flags/service'
import { ResendProvider } from '@/lib/notifications/providers/resend-provider'
import { BrevoProvider } from '@/lib/notifications/providers/brevo-provider'

describe('Batch B4 — Governed Email Egress & Transport Hardening', () => {
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
    vi.unstubAllGlobals()
    process.env = { ...originalEnv }
    // Ensure flag is reset to enabled
    void globalFeatureFlagService.setFlag('EMAIL_ENABLED', true)
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // I-04-B2: EMAIL_ENABLED Kill Switch Enforcement in sendEmail()
  // ─────────────────────────────────────────────────────────────────────────────
  describe('I-04-B2: EMAIL_ENABLED kill switch enforcement', () => {
    it('blocks direct sendEmail when EMAIL_ENABLED is false', async () => {
      await globalFeatureFlagService.setFlag('EMAIL_ENABLED', false)

      const result = await sendEmail({
        to: 'victim@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        text: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(503)
      expect(result.error).toContain('disabled by platform kill switch')
      expect(result.provider).toBe('simulated')
    })

    it('permits direct sendEmail when EMAIL_ENABLED is true', async () => {
      await globalFeatureFlagService.setFlag('EMAIL_ENABLED', true)

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('brevo.com')) {
          return new Response(JSON.stringify({ messageId: 'brevo_ok_123' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      }))

      const result = await sendEmail({
        to: 'student@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
        text: 'Test',
      })

      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.id).toBe('brevo_ok_123')
      expect(result.provider).toBe('brevo')
    })

    it('allows critical emails to bypass EMAIL_ENABLED=false when isCritical is true', async () => {
      await globalFeatureFlagService.setFlag('EMAIL_ENABLED', false)

      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.includes('brevo.com')) {
          return new Response(JSON.stringify({ messageId: 'critical_msg_999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      }))

      const result = await sendEmail({
        to: 'admin@example.com',
        subject: 'Critical Security Alert',
        html: '<p>System Breach Warning</p>',
        text: 'System Breach Warning',
        isCritical: true,
      })

      expect(result.success).toBe(true)
      expect(result.id).toBe('critical_msg_999')
      expect(result.provider).toBe('brevo')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // I-04-B4: Transport Unification & Provider Failover Routing
  // ─────────────────────────────────────────────────────────────────────────────
  describe('I-04-B4: Unified transport via canonical provider registry', () => {
    it('routes direct sendEmail through provider failover when Brevo is exhausted', async () => {
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('brevo.com')) {
          calls.push('brevo')
          return new Response(JSON.stringify({ code: 'not_enough_credits', message: 'Not enough credits' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (urlStr.includes('resend.com')) {
          calls.push('resend')
          return new Response(JSON.stringify({ id: 'resend_failover_success' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        return new Response('Not Found', { status: 404 })
      }))

      const result = await sendEmail({
        to: 'learner@example.com',
        subject: 'Activation email',
        html: '<p>Activate</p>',
        text: 'Activate',
      })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
      expect(result.id).toBe('resend_failover_success')
    })

    it('does not trigger failover on permanent 400 (bad recipient)', async () => {
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('brevo.com')) {
          calls.push('brevo')
          return new Response(JSON.stringify({ code: 'invalid_parameter', message: 'Invalid email address' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (urlStr.includes('resend.com')) {
          calls.push('resend')
          return new Response(JSON.stringify({ id: 'resend_should_not_be_called' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      }))

      const result = await sendEmail({
        to: 'invalid@@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
        text: 'Hello',
      })

      expect(calls).toEqual(['brevo'])
      expect(result.success).toBe(false)
      expect(result.provider).toBe('brevo')
      expect(result.statusCode).toBe(400)
    })

    it('honors preferProvider and avoids falling back onto skipped provider', async () => {
      const calls: string[] = []
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('resend.com')) {
          calls.push('resend')
          return new Response(JSON.stringify({ message: 'Resend 500 error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (urlStr.includes('brevo.com')) {
          calls.push('brevo')
          return new Response(JSON.stringify({ messageId: 'brevo_unexpected' }), { status: 200 })
        }
        return new Response('Not Found', { status: 404 })
      }))

      const result = await sendEmail({
        to: 'learner@example.com',
        subject: 'Hello',
        html: '<p>Hello</p>',
        text: 'Hello',
        preferProvider: 'resend',
      })

      expect(calls).toEqual(['resend'])
      expect(result.success).toBe(false)
      expect(result.provider).toBe('resend')
    })
  })

  // ─────────────────────────────────────────────────────────────────────────────
  // I-04-B7: Bounded Timeouts (EMAIL_HTTP_TIMEOUT_MS)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('I-04-B7: Bounded timeouts on outbound HTTP requests', () => {
    it('EMAIL_HTTP_TIMEOUT_MS is configured to 8000ms', () => {
      expect(EMAIL_HTTP_TIMEOUT_MS).toBe(8000)
    })

    it('BrevoProvider applies bounded timeout signal and handles TimeoutError gracefully', async () => {
      const provider = new BrevoProvider()
      vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
        expect(init?.signal).toBeDefined()
        const timeoutErr = new Error('The operation was aborted due to timeout')
        timeoutErr.name = 'TimeoutError'
        throw timeoutErr
      }))

      const res = await provider.send({
        recipient: { email: 'timeout@example.com' },
        channel: 'email',
        templateKey: 'test.template',
        templateVersion: 1,
        variables: { subject: 'Test', html: '<p>Test</p>', text: 'Test' },
      })

      expect(res.success).toBe(false)
      expect(res.statusCode).toBe(504)
      expect(res.error).toContain('timed out')
    })

    it('ResendProvider applies bounded timeout signal and handles TimeoutError gracefully', async () => {
      const provider = new ResendProvider()
      vi.stubGlobal('fetch', vi.fn(async (_url: unknown, init?: { signal?: AbortSignal }) => {
        expect(init?.signal).toBeDefined()
        const timeoutErr = new Error('The operation was aborted due to timeout')
        timeoutErr.name = 'TimeoutError'
        throw timeoutErr
      }))

      const res = await provider.send({
        recipient: { email: 'timeout@example.com' },
        channel: 'email',
        templateKey: 'test.template',
        templateVersion: 1,
        variables: { subject: 'Test', html: '<p>Test</p>', text: 'Test' },
      })

      expect(res.success).toBe(false)
      expect(res.statusCode).toBe(504)
      expect(res.error).toContain('timed out')
    })
  })
})
