import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { NextRequest } from 'next/server'

// Mock dependencies for isolation
vi.mock('@/lib/notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    isEnabledAsync: vi.fn(async () => true),
    ensureHydrated: vi.fn(async () => undefined),
  },
}))

vi.mock('@/lib/notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => ({ globalPause: false, dailyLimit: 1000 })),
    isAutomationEnabled: vi.fn(async () => true),
    isGlobalPauseActive: vi.fn(async () => false),
    getDigestSchedules: vi.fn(async () => ({
      dailyReminder: { enabled: true, hourUtc: 9 },
      weeklyRecap: { enabled: true, dayOfWeek: 0, hourUtc: 18 },
    })),
    recordDigestRun: vi.fn(async () => undefined),
  },
}))

vi.mock('@/emails', () => ({
  renderEmailTemplate: vi.fn(async () => ({
    html: '<p>Test Email</p>',
    text: 'Test Email',
    subject: 'Test Subject',
  })),
}))

import { POST as handleWebhook } from '../../app/api/email/webhooks/route'
import { GET as handleHealthCheck } from '../../app/api/health/route'
import { POST as handleRetryFailed } from '../../app/api/cron/retry-failed/route'
import { POST as handleDailyReminder } from '../../app/api/cron/daily-reminder/route'
import { POST as handleWeeklyRecap } from '../../app/api/cron/weekly-recap/route'
import {
  getUserLocalTime,
  isValidTimezone,
  isUserInReminderWindow,
  isUserInRecapWindow,
} from '../notifications/timezone'
import {
  classifyProviderFailure,
  isFailoverEligible,
} from '../notifications/providers/failure-classification'
import { sendEmailWithFailover, ProviderRegistry } from '../notifications/providers'
import type { NotificationProvider } from '../notifications/providers/types'
import { enqueueNotificationItem, processEmailQueue } from '../notifications/queue/processor'
import { sendEmail } from '@/lib/email'
import * as supabaseModule from '@/lib/supabase'

describe('Phase T5 — Operational Resilience & Observability Test Suite', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    delete process.env.RESEND_API_KEY
    delete process.env.BREVO_API_KEY
    process.env.CRON_SECRET = 'test-cron-secret'
    process.env.RESEND_WEBHOOK_SECRET = 'whsec_test_secret_svix'
    process.env.BREVO_WEBHOOK_SECRET = 'test_brevo_secret'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T5.1 — Email Bounce / Complaint Webhook Ingestion & Suppression Sync
  // ──────────────────────────────────────────────────────────────────────────
  describe('T5.1: Email Bounce / Complaint Webhook Ingestion & Suppression', () => {
    function generateSvixHeaders(payload: string, secret: string = 'whsec_test_secret_svix') {
      const svixId = `msg_${Date.now()}`
      const svixTimestamp = `${Math.floor(Date.now() / 1000)}`
      const cleanSecret = secret.startsWith('whsec_') ? secret.substring(6) : secret
      let secretBytes: Buffer
      try {
        secretBytes = Buffer.from(cleanSecret, 'base64')
      } catch {
        secretBytes = Buffer.from(cleanSecret, 'utf-8')
      }
      const toSign = `${svixId}.${svixTimestamp}.${payload}`
      const computedHmac = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')
      return {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': `v1,${computedHmac}`,
      }
    }

    it('rejects unauthenticated webhook requests with HTTP 401', async () => {
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } }),
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toContain('Unauthorized')
    })

    it('rejects invalid Svix signature with HTTP 401', async () => {
      const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_123' } })
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': 'msg_bad',
          'svix-timestamp': `${Math.floor(Date.now() / 1000)}`,
          'svix-signature': 'v1,invalid_signature_hash',
        },
        body: payload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(401)
    })

    // Regression: production must fail CLOSED when a webhook cannot be verified. Without
    // env validation, a deploy could start with RESEND_WEBHOOK_SECRET unset; a request
    // carrying svix headers would then be processed unverified — a forgery vector into
    // the suppression/preference tables.
    it('rejects a signed (svix) request with HTTP 401 in production when RESEND_WEBHOOK_SECRET is missing', async () => {
      const prevNodeEnv = process.env.NODE_ENV
      delete process.env.RESEND_WEBHOOK_SECRET
      delete process.env.BREVO_WEBHOOK_SECRET
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      try {
        const payload = JSON.stringify({ type: 'email.bounced', data: { email: 'victim@example.com', bounce: { type: 'Permanent' } } })
        const req = new Request('http://localhost:3000/api/email/webhooks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'svix-id': 'msg_forged',
            'svix-timestamp': `${Math.floor(Date.now() / 1000)}`,
            'svix-signature': 'v1,anything',
          },
          body: payload,
        })
        const res = await handleWebhook(req)
        expect(res.status).toBe(401)
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv
      }
    })

    it('rejects an unsigned request with HTTP 401 in production when no webhook secret is configured', async () => {
      const prevNodeEnv = process.env.NODE_ENV
      delete process.env.RESEND_WEBHOOK_SECRET
      delete process.env.BREVO_WEBHOOK_SECRET
      ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
      try {
        const req = new Request('http://localhost:3000/api/email/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: 'hard_bounce', email: 'victim@example.com' }),
        })
        const res = await handleWebhook(req)
        expect(res.status).toBe(401)
      } finally {
        ;(process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv
      }
    })

    it('handles malformed JSON payload safely with HTTP 400 without crashing', async () => {
      const malformedPayload = '{"type": "email.bounced", data: { unclosed'
      const headers = generateSvixHeaders(malformedPayload)
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: malformedPayload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Invalid JSON')
    })

    it('processes hard bounce: logs delivery event, records suppression, and syncs user preferences', async () => {
      const insertedEvents: Array<Record<string, unknown>> = []
      const upsertedSuppressions: Array<Record<string, unknown>> = []
      const updatedPrefs: Array<Record<string, unknown>> = []

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_delivery_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: async (row: Record<string, unknown>) => {
                insertedEvents.push(row)
                return { data: null, error: null }
              },
            }
          }
          if (table === 'email_queue') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'queue-100' }, error: null }) }) }),
              update: () => ({ eq: async () => ({ data: null, error: null }) }),
            }
          }
          if (table === 'email_suppressions') {
            return {
              upsert: async (row: Record<string, unknown>) => {
                upsertedSuppressions.push(row)
                return { data: null, error: null }
              },
            }
          }
          if (table === 'users') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-bounce-1' }, error: null }) }) }),
            }
          }
          if (table === 'user_notification_preferences') {
            return {
              update: (row: Record<string, unknown>) => {
                updatedPrefs.push(row)
                return { eq: async () => ({ data: null, error: null }) }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const payload = JSON.stringify({
        type: 'email.bounced',
        data: {
          email_id: 're_bounce_123',
          to: 'bounced.learner@example.com',
          bounce: { type: 'Permanent', message: 'Mailbox does not exist' },
        },
      })
      const headers = generateSvixHeaders(payload)
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)

      // 1. Delivery event recorded with provider_event_id
      expect(insertedEvents.length).toBe(1)
      expect(insertedEvents[0].event_type).toBe('email.bounced')
      expect(insertedEvents[0].provider_event_id).toBe(`resend:${headers['svix-id']}`)

      // 2. Suppression persisted
      expect(upsertedSuppressions.length).toBe(1)
      expect(upsertedSuppressions[0].email).toBe('bounced.learner@example.com')
      expect(upsertedSuppressions[0].reason).toBe('hard_bounce')

      // 3. User notification preferences synchronized (all_email: false)
      expect(updatedPrefs.length).toBe(1)
      expect(updatedPrefs[0].all_email).toBe(false)
      expect(updatedPrefs[0].marketing_email).toBe(false)
    })

    it('soft bounce records event but does NOT permanently suppress or mark queue failed', async () => {
      const insertedEvents: Array<Record<string, unknown>> = []
      const upsertedSuppressions: Array<Record<string, unknown>> = []

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_delivery_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: async (row: Record<string, unknown>) => {
                insertedEvents.push(row)
                return { data: null, error: null }
              },
            }
          }
          if (table === 'email_queue') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'queue-soft' }, error: null }) }) }),
              update: vi.fn(), // Should NOT be called for soft bounce
            }
          }
          if (table === 'email_suppressions') {
            return {
              upsert: async (row: Record<string, unknown>) => {
                upsertedSuppressions.push(row)
                return { data: null, error: null }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const payload = JSON.stringify({
        type: 'email.bounced',
        data: {
          email_id: 're_soft_123',
          to: 'busy.learner@example.com',
          bounce: { type: 'Transient', message: 'Mailbox full' },
        },
      })
      const headers = generateSvixHeaders(payload)
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(200)

      // Event recorded with normalized soft bounce type
      expect(insertedEvents.length).toBe(1)
      expect(insertedEvents[0].event_type).toBe('email.bounced_soft')

      // Zero suppressions created for transient bounce
      expect(upsertedSuppressions.length).toBe(0)
    })

    it('spam complaint creates spam_complaint suppression and syncs preferences', async () => {
      const upsertedSuppressions: Array<Record<string, unknown>> = []
      const updatedPrefs: Array<Record<string, unknown>> = []

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_delivery_events') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: async () => ({ data: null, error: null }),
            }
          }
          if (table === 'email_suppressions') {
            return {
              upsert: async (row: Record<string, unknown>) => {
                upsertedSuppressions.push(row)
                return { data: null, error: null }
              },
            }
          }
          if (table === 'users') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-complaint' }, error: null }) }) }),
            }
          }
          if (table === 'user_notification_preferences') {
            return {
              update: (row: Record<string, unknown>) => {
                updatedPrefs.push(row)
                return { eq: async () => ({ data: null, error: null }) }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const payload = JSON.stringify({
        event: 'complaint',
        email: 'complained.learner@example.com',
        'message-id': 'brevo-msg-complaint-99',
      })
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-brevo-webhook-secret': 'test_brevo_secret',
        },
        body: payload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(200)

      expect(upsertedSuppressions.length).toBe(1)
      expect(upsertedSuppressions[0].email).toBe('complained.learner@example.com')
      expect(upsertedSuppressions[0].reason).toBe('spam_complaint')
      expect(updatedPrefs.length).toBe(1)
      expect(updatedPrefs[0].all_email).toBe(false)
    })

    it('duplicate webhook delivery is idempotent and does not re-insert', async () => {
      let insertCount = 0
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_delivery_events') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: { id: 'already-existing-event-id' }, error: null }),
                }),
              }),
              insert: async () => {
                insertCount++
                return { data: null, error: null }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const payload = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_dup_123' } })
      const headers = generateSvixHeaders(payload)
      const req = new Request('http://localhost:3000/api/email/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: payload,
      })

      const res = await handleWebhook(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.duplicate).toBe(true)
      expect(insertCount).toBe(0)
    })

    it('suppressed user cannot receive non-critical emails but critical auth emails bypass suppression', async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'email_suppressions') {
            return {
              select: () => ({
                eq: (col: string, val: string) => ({
                  maybeSingle: async () => {
                    if (val === 'suppressed@example.com') {
                      return { data: { id: 'sup-1', reason: 'hard_bounce' }, error: null }
                    }
                    return { data: null, error: null }
                  },
                }),
              }),
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'q-1' }, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      // Direct non-critical send -> blocked
      const directNonCritical = await sendEmail({
        to: 'suppressed@example.com',
        subject: 'Weekly Digest',
        html: '<p>Digest</p>',
        text: 'Digest',
        isCritical: false,
        checkSuppression: true,
      })
      expect(directNonCritical.success).toBe(false)
      expect(directNonCritical.error).toContain('suppressed')

      // Direct critical send -> allowed
      const directCritical = await sendEmail({
        to: 'suppressed@example.com',
        subject: 'Reset Password',
        html: '<p>Reset</p>',
        text: 'Reset',
        isCritical: true,
      })
      expect(directCritical.success).toBe(true)

      // Queue non-critical enqueue -> blocked
      const queueNonCritical = await enqueueNotificationItem({
        userId: 'user-suppressed',
        toEmail: 'suppressed@example.com',
        channel: 'email',
        templateKey: 'learning.daily_reminder',
        templateVariables: {},
        eventType: 'learning.daily_reminder',
        category: 'learning',
      })
      expect(queueNonCritical.success).toBe(false)
      expect(queueNonCritical.reason).toContain('suppressed')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T5.2 — System Health Check Endpoint (/api/health)
  // ──────────────────────────────────────────────────────────────────────────
  describe('T5.2: System Health Check Endpoint (/api/health)', () => {
    it('returns HTTP 200 with operational telemetry when database is healthy', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: () => ({
            limit: async () => ({ data: [{ id: 'user-health-ok' }], error: null }),
          }),
        })),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const res = await handleHealthCheck(new NextRequest('http://localhost:3000/api/health'))
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.status).toBe('ok')
      expect(json.database).toBe('connected')
      expect(typeof json.latencyMs).toBe('number')
      expect(json.services.database.status).toBe('healthy')
      expect(json.services.application.status).toBe('healthy')
      expect(res.headers.get('cache-control')).toContain('no-cache')

      // Assert zero secret leakage in health payload
      const jsonStr = JSON.stringify(json)
      expect(jsonStr).not.toContain('key')
      expect(jsonStr).not.toContain('secret')
      expect(jsonStr).not.toContain('token')
      expect(jsonStr).not.toContain('password')
      expect(jsonStr).not.toContain('postgres://')
    })

    it('returns HTTP 503 when database is unreachable or degraded', async () => {
      const mockSupabase = {
        from: vi.fn(() => ({
          select: () => ({
            limit: async () => {
              throw new Error('Database connection terminated')
            },
          }),
        })),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const res = await handleHealthCheck(new NextRequest('http://localhost:3000/api/health'))
      expect(res.status).toBe(503)

      const json = await res.json()
      expect(json.status).toBe('error')
      expect(json.database).toBe('unreachable')
      expect(json.services.database.status).toBe('unhealthy')
    })

    it('confirms Redis is not a required dependency in current architecture', () => {
      // Prodily relies on PostgreSQL public.rate_limits and public.email_queue; Redis is not configured or required
      expect(process.env.REDIS_URL).toBeUndefined()
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T5.3 — Email Provider Failover & Alerting
  // ──────────────────────────────────────────────────────────────────────────
  describe('T5.3: Email Provider Failover & Alerting', () => {
    it('classifies provider failures correctly: failover on capacity/5xx, permanent on 400/422', () => {
      // Failover eligible: capacity, 5xx, or network timeout/DNS
      expect(classifyProviderFailure(402, 'out_of_credit')).toBe('failover')
      expect(classifyProviderFailure(429, 'rate_limit_exceeded')).toBe('failover')
      expect(classifyProviderFailure(500, 'Internal Server Error')).toBe('failover')
      expect(classifyProviderFailure(503, 'Service Unavailable')).toBe('failover')
      expect(classifyProviderFailure(0, 'DNS failure')).toBe('failover')
      expect(isFailoverEligible(500)).toBe(true)

      // Permanent failures: invalid email, auth refusal, unprocessable entity
      expect(classifyProviderFailure(400, 'bad_request')).toBe('permanent')
      expect(classifyProviderFailure(401, 'unauthorized')).toBe('permanent')
      expect(classifyProviderFailure(403, 'forbidden')).toBe('permanent')
      expect(classifyProviderFailure(422, 'invalid_recipient')).toBe('permanent')
      expect(isFailoverEligible(400)).toBe(false)
      expect(isFailoverEligible(422)).toBe(false)
    })

    it('does NOT attempt fake fallback when secondary provider is not configured', async () => {
      const registry = new ProviderRegistry()

      // Primary provider that fails with 500
      const primaryMock: NotificationProvider = {
        name: 'brevo',
        supportedChannels: ['email'],
        send: vi.fn(async () => ({
          success: false,
          providerName: 'brevo',
          error: 'Brevo outage',
          statusCode: 500,
          timestamp: new Date().toISOString(),
        })),
        isConfigured: () => true,
        healthCheck: async () => ({ providerName: 'brevo', isHealthy: true, latencyMs: 10 }),
      }

      // Unconfigured secondary provider (no API key in environment)
      const secondaryMock: NotificationProvider = {
        name: 'resend',
        supportedChannels: ['email'],
        send: vi.fn(async () => ({ success: true, providerName: 'resend', timestamp: new Date().toISOString() })),
        isConfigured: () => false, // NOT configured
        healthCheck: async () => ({ providerName: 'resend', isHealthy: false, latencyMs: 0 }),
      }

      registry.registerProvider(primaryMock)
      registry.registerProvider(secondaryMock)

      const result = await sendEmailWithFailover(
        {
          recipient: { email: 'learner@example.com' },
          channel: 'email',
          templateKey: 'test.template',
          templateVersion: 1,
          variables: {},
        },
        registry
      )

      expect(result.success).toBe(false)
      expect(result.failedOver).toBe(false)
      expect(result.error).toContain('no configured failover provider: resend')
      // Secondary send was NOT called
      expect(secondaryMock.send).not.toHaveBeenCalled()
    })

    it('triggers failover to configured secondary provider on eligible 500 error', async () => {
      const registry = new ProviderRegistry()

      const primaryMock: NotificationProvider = {
        name: 'brevo',
        supportedChannels: ['email'],
        send: vi.fn(async () => ({
          success: false,
          providerName: 'brevo',
          error: 'Brevo HTTP 500',
          statusCode: 500,
          timestamp: new Date().toISOString(),
        })),
        isConfigured: () => true,
        healthCheck: async () => ({ providerName: 'brevo', isHealthy: true, latencyMs: 10 }),
      }

      const secondaryMock: NotificationProvider = {
        name: 'resend',
        supportedChannels: ['email'],
        send: vi.fn(async () => ({
          success: true,
          providerName: 'resend',
          externalId: 'resend-msg-12345',
          timestamp: new Date().toISOString(),
        })),
        isConfigured: () => true,
        healthCheck: async () => ({ providerName: 'resend', isHealthy: true, latencyMs: 10 }),
      }

      registry.registerProvider(primaryMock)
      registry.registerProvider(secondaryMock)

      const result = await sendEmailWithFailover(
        {
          recipient: { email: 'learner@example.com' },
          channel: 'email',
          templateKey: 'test.template',
          templateVersion: 1,
          variables: {},
        },
        registry
      )

      expect(result.success).toBe(true)
      expect(result.failedOver).toBe(true)
      expect(result.provider).toBe('resend')
      expect(result.externalId).toBe('resend-msg-12345')
      expect(primaryMock.send).toHaveBeenCalledTimes(1)
      expect(secondaryMock.send).toHaveBeenCalledTimes(1)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T5.4 — Reminder Cron Timezone-Aware Delivery
  // ──────────────────────────────────────────────────────────────────────────
  describe('T5.4: Reminder Cron Timezone-Aware Delivery', () => {
    it('resolves user local hour and date accurately across multiple IANA timezones', () => {
      // 2026-09-26T00:00:00.000Z
      const testDate = new Date('2026-09-26T00:00:00.000Z')

      // UTC
      const utcTime = getUserLocalTime('UTC', testDate)
      expect(utcTime.localHour).toBe(0)
      expect(utcTime.localDate).toBe('2026-09-26')

      // Tokyo: UTC+9 -> 09:00 AM on 2026-09-26
      const tokyoTime = getUserLocalTime('Asia/Tokyo', testDate)
      expect(tokyoTime.localHour).toBe(9)
      expect(tokyoTime.localDate).toBe('2026-09-26')

      // New York: EDT (UTC-4 in Sep) -> 20:00 (8 PM) on 2026-09-25
      const nyTime = getUserLocalTime('America/New_York', testDate)
      expect(nyTime.localHour).toBe(20)
      expect(nyTime.localDate).toBe('2026-09-25')

      // India (IST, UTC+5:30) -> 05:30 AM (hour: 5) on 2026-09-26
      const istTime = getUserLocalTime('Asia/Kolkata', testDate)
      expect(istTime.localHour).toBe(5)
      expect(istTime.localDate).toBe('2026-09-26')
    })

    it('safely falls back to UTC on invalid or missing timezone strings', () => {
      expect(isValidTimezone('Invalid/Timezone')).toBe(false)
      expect(isValidTimezone('')).toBe(false)
      expect(isValidTimezone(null)).toBe(false)

      const fallback = getUserLocalTime('Invalid/Fake_Zone', new Date('2026-09-26T12:00:00Z'))
      expect(fallback.localHour).toBe(12)
      expect(fallback.localDate).toBe('2026-09-26')
    })

    it('evaluates delivery windows accurately for daily reminder and weekly recap', () => {
      const now = new Date('2026-09-26T00:00:00.000Z') // Saturday 00:00 UTC

      // Tokyo learner at 9 AM local is IN reminder window
      const tokyoWindow = isUserInReminderWindow('Asia/Tokyo', 9, now)
      expect(tokyoWindow.inWindow).toBe(true)

      // London learner at 1 AM BST is OUT of reminder window
      const londonWindow = isUserInReminderWindow('Europe/London', 9, now)
      expect(londonWindow.inWindow).toBe(false)

      // Sunday 18:00 (6 PM) local recap check
      const sundayEveningUtc = new Date('2026-09-27T18:00:00.000Z') // Sunday 18:00 UTC
      const recapUtc = isUserInRecapWindow('UTC', 0, 18, sundayEveningUtc)
      expect(recapUtc.inWindow).toBe(true)
    })

    it('daily reminder cron respects timezone delivery windows and local date idempotency', async () => {
      const enqueuedItems: Array<Record<string, unknown>> = []

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === 'users') {
            return {
              select: () => ({
                gt: () => ({
                  not: () => ({
                    order: () => ({
                      limit: async () => ({
                        data: [
                          { id: 'user-tokyo', email: 'tokyo@example.com', name: 'Kenji', current_streak: 5 },
                          { id: 'user-ny', email: 'ny@example.com', name: 'Sarah', current_streak: 3 },
                        ],
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          if (table === 'user_notification_preferences') {
            return {
              select: () => ({
                in: async () => ({
                  data: [
                    { user_id: 'user-tokyo', timezone: 'Asia/Tokyo', preferred_reminder_hour: 9, all_notifications: true, all_email: true, learning_email: true },
                    { user_id: 'user-ny', timezone: 'America/New_York', preferred_reminder_hour: 9, all_notifications: true, all_email: true, learning_email: true },
                  ],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'email_suppressions') {
            return {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            }
          }
          if (table === 'email_queue') {
            return {
              insert: (item: Record<string, unknown>) => {
                enqueuedItems.push(item)
                return { select: () => ({ single: async () => ({ data: { id: 'q-item-1' }, error: null }) }) }
              },
            }
          }
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          }
        }),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      // Test with force=true: both users are enqueued with their respective local date idempotency keys
      const reqForce = new Request('http://localhost:3000/api/cron/daily-reminder?force=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-cron-secret' },
      })
      const resForce = await handleDailyReminder(reqForce)
      expect(resForce.status).toBe(200)
      const dataForce = await resForce.json()
      expect(dataForce.remindersQueued).toBe(2)

      // Idempotency keys reflect deterministic local date
      expect(enqueuedItems[0].idempotency_key).toMatch(/^daily-reminder-user-tokyo-\d{4}-\d{2}-\d{2}$/)
      expect(enqueuedItems[1].idempotency_key).toMatch(/^daily-reminder-user-ny-\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T5.5 — Redundant Retry Cron Deprecation & Verification
  // ──────────────────────────────────────────────────────────────────────────
  describe('T5.5: Redundant Retry Cron Deprecation & Verification', () => {
    it('/api/cron/retry-failed is marked as deprecated and returns honesty note', async () => {
      const mockSupabase = {
        rpc: vi.fn(async () => ({ data: [], error: null })),
        from: vi.fn(() => ({
          select: () => ({ in: () => ({ lte: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
        })),
      }
      vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(mockSupabase as never)

      const req = new Request('http://localhost:3000/api/cron/retry-failed', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-cron-secret' },
      })

      const res = await handleRetryFailed(req)
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(body.success).toBe(true)
      expect(body.deprecated).toBe(true)
      expect(body.note).toContain('performs no dead-letter recovery')
      expect(body.note).toContain('process-email-queue')
    })
  })
})
