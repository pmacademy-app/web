import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BrevoProvider } from '../notifications/providers/brevo-provider'
import { ProviderRegistry, getActiveEmailProvider } from '../notifications/providers'
import { sendEmail } from '@/lib/email'
import { POST as webhookPost } from '@/app/api/email/webhooks/route'
import * as supabaseModule from '../supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

describe('Phase 4 — Brevo Email Infrastructure & Transactional Email Migration Test Suite', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  describe('1. BrevoProvider Implementation & REST API Integration', () => {
    it('constructs correct payload and handles successful Brevo REST API response', async () => {
      process.env.BREVO_API_KEY = 'test_brevo_api_key_123'
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      process.env.BREVO_SIMULATE = 'false'

      let capturedUrl = ''
      let capturedOptions: RequestInit | undefined

      const mockFetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        capturedUrl = url
        capturedOptions = options
        return {
          ok: true,
          status: 201,
          json: async () => ({ messageId: '<202608301200.brevo-msg-789@smtp-relay.brevo.com>' }),
        }
      })
      vi.stubGlobal('fetch', mockFetch)

      const provider = new BrevoProvider()
      const result = await provider.send({
        recipient: {
          userId: 'usr_123',
          email: 'learner@example.com',
          name: 'Jane Doe',
        },
        channel: 'email',
        templateKey: 'auth.verify_email',
        templateVersion: 1,
        variables: {
          subject: 'Verify your Prodily account',
          html: '<p>Click here to verify</p>',
          text: 'Click here to verify',
          replyTo: 'support@prodily.app',
        },
      })

      expect(result.success).toBe(true)
      expect(result.providerName).toBe('brevo')
      expect(result.externalId).toBe('<202608301200.brevo-msg-789@smtp-relay.brevo.com>')

      expect(capturedUrl).toBe('https://api.brevo.com/v3/smtp/email')
      expect(capturedOptions?.method).toBe('POST')
      const headers = capturedOptions?.headers as Record<string, string>
      expect(headers['api-key']).toBe('test_brevo_api_key_123')
      expect(headers['Content-Type']).toBe('application/json')

      const body = JSON.parse(capturedOptions?.body as string)
      expect(body.to).toEqual([{ email: 'learner@example.com', name: 'Jane Doe' }])
      expect(body.subject).toBe('Verify your Prodily account')
      expect(body.htmlContent).toBe('<p>Click here to verify</p>')
      expect(body.textContent).toBe('Click here to verify')
      expect(body.replyTo).toEqual({ email: 'support@prodily.app' })
    })

    it('gracefully handles Brevo API error responses without throwing', async () => {
      process.env.BREVO_API_KEY = 'invalid_key'
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      process.env.BREVO_SIMULATE = 'false'

      const mockFetch = vi.fn().mockImplementation(async () => {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: 'unauthorized', message: 'Key not found in account' }),
        }
      })
      vi.stubGlobal('fetch', mockFetch)

      const provider = new BrevoProvider()
      const result = await provider.send({
        recipient: { userId: 'usr_1', email: 'test@example.com' },
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVersion: 1,
        variables: { subject: 'Welcome', html: '<p>Hi</p>', text: 'Hi' },
      })

      expect(result.success).toBe(false)
      expect(result.providerName).toBe('brevo')
      expect(result.error).toContain('Key not found in account')
    })

    it('handles network timeouts cleanly with actionable diagnostic messaging', async () => {
      process.env.BREVO_API_KEY = 'test_key'
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      process.env.BREVO_SIMULATE = 'false'

      const timeoutError = new Error('The operation was aborted due to timeout')
      timeoutError.name = 'TimeoutError'

      const mockFetch = vi.fn().mockRejectedValue(timeoutError)
      vi.stubGlobal('fetch', mockFetch)

      const provider = new BrevoProvider()
      const result = await provider.send({
        recipient: { userId: 'usr_1', email: 'timeout@example.com' },
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVersion: 1,
        variables: { subject: 'Welcome' },
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('timed out after 8 s')
    })

    it('rejects payloads missing recipient email', async () => {
      const provider = new BrevoProvider()
      const result = await provider.send({
        recipient: { userId: 'usr_no_email' },
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVersion: 1,
        variables: {},
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing recipient email address')
    })
  })

  describe('2. Provider Selection & Centralized Provider Registry', () => {
    it('selects Brevo when PRIMARY_EMAIL_PROVIDER is brevo', () => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
      process.env.BREVO_API_KEY = 'brevo_key'
      process.env.RESEND_API_KEY = 'resend_key'

      const registry = new ProviderRegistry()
      const active = getActiveEmailProvider(registry)
      expect(active.name).toBe('brevo')
    })

    it('selects Resend when PRIMARY_EMAIL_PROVIDER is resend', () => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'resend'
      process.env.BREVO_API_KEY = 'brevo_key'
      process.env.RESEND_API_KEY = 'resend_key'

      const registry = new ProviderRegistry()
      const active = getActiveEmailProvider(registry)
      expect(active.name).toBe('resend')
    })

    it('defaults to Brevo when BREVO_API_KEY is present and PRIMARY_EMAIL_PROVIDER is unset', () => {
      delete process.env.PRIMARY_EMAIL_PROVIDER
      process.env.BREVO_API_KEY = 'brevo_key'

      const registry = new ProviderRegistry()
      const active = getActiveEmailProvider(registry)
      expect(active.name).toBe('brevo')
    })
  })

  describe('3. Direct Send Service (lib/email.ts) Migration', () => {
    it('sendEmail dispatches via Brevo when PRIMARY_EMAIL_PROVIDER=brevo', async () => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
      process.env.BREVO_API_KEY = 'brevo_test_key'
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      process.env.BREVO_SIMULATE = 'false'

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messageId: 'brevo_direct_msg_101' }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await sendEmail({
        to: 'recipient@domain.com',
        subject: 'Password Reset Request',
        html: '<p>Reset link</p>',
        text: 'Reset link',
      })

      expect(result.success).toBe(true)
      expect(result.provider).toBe('brevo')
      expect(result.id).toBe('brevo_direct_msg_101')
    })

    it('sendEmail falls back from Brevo failure to Resend when Resend API key exists', async () => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
      process.env.BREVO_API_KEY = 'brevo_failing_key'
      process.env.RESEND_API_KEY = 'resend_backup_key'
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      process.env.BREVO_SIMULATE = 'false'
      process.env.RESEND_SIMULATE = 'false'

      let fetchCallCount = 0
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        fetchCallCount++
        if (url.includes('brevo.com')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ message: 'Brevo internal gateway error' }),
          }
        }
        if (url.includes('resend.com')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 'resend_fallback_msg_202' }),
          }
        }
        return { ok: false, status: 404 }
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await sendEmail({
        to: 'learner@domain.com',
        subject: 'Important Notification',
        html: '<p>Hello</p>',
        text: 'Hello',
      })

      expect(fetchCallCount).toBe(2)
      expect(result.success).toBe(true)
      expect(result.provider).toBe('resend')
      expect(result.id).toBe('resend_fallback_msg_202')
    })
  })

  describe('4. Delivery Tracking & Webhook Support for Brevo & Resend', () => {
    it('accepts valid Brevo webhook request with x-brevo-webhook-secret header', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'test_brevo_secret_999'

      let updatedStatus = ''
      let updatedQueueId = ''
      let insertedDeliveryEvent: Record<string, unknown> | null = null

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'email_queue') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => {
                    if (col === 'resend_id' && val === '<msg-brevo-999>') {
                      return { data: { id: 'queue_row_555' } }
                    }
                    return { data: null }
                  },
                }),
              }),
              update: (updatePayload: Record<string, unknown>) => ({
                eq: (_col: string, val: string) => {
                  updatedStatus = updatePayload.status as string
                  updatedQueueId = val
                  return Promise.resolve({ data: null, error: null })
                },
              }),
            }
          }
          if (table === 'email_delivery_events') {
            return {
              insert: async (row: Record<string, unknown>) => {
                insertedDeliveryEvent = row
                return { error: null }
              },
            }
          }
          return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const brevoWebhookPayload = {
        event: 'delivered',
        email: 'learner@example.com',
        'message-id': '<msg-brevo-999>',
        date: '2026-08-30 12:00:00',
        ts: 1788177600,
      }

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-brevo-webhook-secret': 'test_brevo_secret_999',
        },
        body: JSON.stringify(brevoWebhookPayload),
      })

      const response = await webhookPost(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(updatedStatus).toBe('delivered')
      expect(updatedQueueId).toBe('queue_row_555')
      expect((insertedDeliveryEvent as Record<string, unknown> | null)?.event_type).toBe('email.delivered')
    })

    it('accepts valid Brevo webhook request with alternative standard x-webhook-secret header', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'alt_header_secret_888'

      const mockSupabase = {
        from: () => ({
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          insert: async () => ({ error: null }),
        }),
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': 'alt_header_secret_888',
        },
        body: JSON.stringify({ event: 'delivered', email: 'test@example.com', 'message-id': '<m-1>' }),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(200)
    })

    it('rejects Brevo webhook with 401 when query-string token is attempted (enforcing header-only auth)', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'strict_header_secret'

      const request = new Request('https://prodily.app/api/email/webhooks?secret=strict_header_secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'delivered', email: 'test@example.com', 'message-id': '<m-2>' }),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(401)
    })

    it('rejects Brevo webhook with 401 when BREVO_WEBHOOK_SECRET is set but header is missing', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'configured_secret_123'

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'delivered', email: 'test@example.com' }),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toContain('Unauthorized')
    })

    it('rejects Brevo webhook with 401 when BREVO_WEBHOOK_SECRET is set and token is invalid', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'expected_secret'

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-brevo-webhook-secret': 'wrong_secret',
        },
        body: JSON.stringify({ event: 'delivered', email: 'test@example.com' }),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(401)
    })

    it('auto-suppresses recipient on authenticated Brevo spam complaint webhook', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'valid_spam_secret'
      let suppressedEmail = ''
      let suppressedReason = ''

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'email_queue') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { id: 'queue_row_666' } }) }),
              }),
              update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
            }
          }
          if (table === 'email_delivery_events') {
            return { insert: async () => ({ error: null }) }
          }
          if (table === 'email_suppressions') {
            return {
              upsert: async (row: { email: string; reason: string }) => {
                suppressedEmail = row.email
                suppressedReason = row.reason
                return { error: null }
              },
            }
          }
          return {}
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const spamPayload = {
        event: 'spam',
        email: 'complainer@example.com',
        'message-id': '<msg-spam-123>',
      }

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-brevo-webhook-secret': 'valid_spam_secret',
        },
        body: JSON.stringify(spamPayload),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(200)
      expect(suppressedEmail).toBe('complainer@example.com')
      expect(suppressedReason).toBe('spam_complaint')
    })

    it('rejects unauthenticated forged spam complaint event and does not modify email_suppressions', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'production_webhook_secret'
      let suppressionCalled = false

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'email_suppressions') {
            return {
              upsert: async () => {
                suppressionCalled = true
                return { error: null }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
            insert: async () => ({ error: null }),
          }
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const forgedSpamPayload = {
        event: 'spam',
        email: 'innocent_user@example.com',
        'message-id': '<forged-msg-id>',
      }

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgedSpamPayload),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(401)
      expect(suppressionCalled).toBe(false)
    })

    it('rejects unauthenticated forged delivery event and does not modify email_queue', async () => {
      process.env.BREVO_WEBHOOK_SECRET = 'production_webhook_secret'
      let queueUpdateCalled = false

      const mockSupabase = {
        from: (table: string) => {
          if (table === 'email_queue') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'q_1' } }) }) }),
              update: () => {
                queueUpdateCalled = true
                return { eq: () => Promise.resolve({ data: null, error: null }) }
              },
            }
          }
          return {
            insert: async () => ({ error: null }),
          }
        },
      } as unknown as SupabaseClient<Database>

      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase)

      const forgedDeliveryPayload = {
        event: 'delivered',
        email: 'target@example.com',
        'message-id': '<fake-msg-id>',
      }

      const request = new Request('https://prodily.app/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forgedDeliveryPayload),
      })

      const response = await webhookPost(request)
      expect(response.status).toBe(401)
      expect(queueUpdateCalled).toBe(false)
    })
  })
})
