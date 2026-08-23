/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { POST } from '../../app/api/auth/send-email-hook/route'
import { BRAND } from '@/lib/brand'
import { maskEmail, sendEmail } from '@/lib/email'
import { classifyAuthError } from '@/lib/auth/errors'

function createMockRequest(url: string, options: {
  method?: string
  headers?: Record<string, string>
  body?: string
}) {
  const parsedUrl = new URL(url)
  const headerMap = new Map<string, string>()
  if (options.headers) {
    Object.entries(options.headers).forEach(([k, v]) => headerMap.set(k.toLowerCase(), v))
  }

  return {
    url,
    nextUrl: parsedUrl,
    method: options.method || 'POST',
    headers: {
      get: (headerName: string) => headerMap.get(headerName.toLowerCase()) || null,
    },
    text: async () => options.body || '',
    json: async () => JSON.parse(options.body || '{}'),
  } as any
}

describe('Phase 5 — Authentication Reliability, Ghost Accounts & Email Hook Hardening', () => {
  const initialSecret = process.env.SEND_EMAIL_HOOK_SECRET
  const initialResendKey = process.env.RESEND_API_KEY
  const initialBrevoKey = process.env.BREVO_API_KEY
  const initialNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    delete process.env.SEND_EMAIL_HOOK_SECRET
    delete process.env.RESEND_API_KEY
    delete process.env.BREVO_API_KEY
    vi.restoreAllMocks()
  })

  afterEach(() => {
    if (initialSecret) process.env.SEND_EMAIL_HOOK_SECRET = initialSecret
    else delete process.env.SEND_EMAIL_HOOK_SECRET

    if (initialResendKey) process.env.RESEND_API_KEY = initialResendKey
    else delete process.env.RESEND_API_KEY

    if (initialBrevoKey) process.env.BREVO_API_KEY = initialBrevoKey
    else delete process.env.BREVO_API_KEY

    ;(process.env as any).NODE_ENV = initialNodeEnv
  })

  describe('1. Secret Verification & Webhook Authentication', () => {
    it('fails closed with HTTP 401 in production mode if SEND_EMAIL_HOOK_SECRET is missing', async () => {
      ;(process.env as any).NODE_ENV = 'production'
      delete process.env.SEND_EMAIL_HOOK_SECRET

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-1', email: 'test@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toContain('Missing hook secret')
    })

    it('rejects unauthenticated requests with HTTP 401 when hook secret is configured', async () => {
      process.env.SEND_EMAIL_HOOK_SECRET = 'super_secret_hook_key_123'

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-1', email: 'test@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
    })

    it('accepts valid Bearer token authorization header', async () => {
      const secret = 'valid_bearer_secret'
      process.env.SEND_EMAIL_HOOK_SECRET = secret

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        headers: { Authorization: `Bearer ${secret}` },
        body: JSON.stringify({
          user: { id: 'usr-1', email: 'bearer@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_bearer_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
    })

    it('accepts valid Svix / Supabase v1,whsec_... HMAC-SHA256 signature', async () => {
      const rawSecret = ['whsec', Buffer.from('test svix secret bytes').toString('base64')].join('_')
      const fullSecret = `v1,${rawSecret}`
      process.env.SEND_EMAIL_HOOK_SECRET = fullSecret

      const payloadObj = {
        user: { id: 'usr-svix', email: 'svix@example.com', user_metadata: { full_name: 'Svix User' } },
        email_data: { email_action_type: 'signup', token_hash: 'th_svix_123' },
      }
      const rawBody = JSON.stringify(payloadObj)
      const msgId = 'msg_svix_999'
      const msgTimestamp = '1720000000'
      const payloadToSign = `${msgId}.${msgTimestamp}.${rawBody}`
      const keyBytes = Buffer.from('test svix secret bytes', 'utf-8')
      const computedSig = crypto.createHmac('sha256', keyBytes).update(payloadToSign).digest('base64')

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        headers: {
          'webhook-id': msgId,
          'webhook-timestamp': msgTimestamp,
          'webhook-signature': `v1,${computedSig}`,
        },
        body: rawBody,
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
    })
  })

  describe('2. Payload Validation & Error Resilience', () => {
    it('returns HTTP 400 for malformed non-JSON payloads', async () => {
      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: 'NOT_VALID_JSON{{{',
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Invalid JSON payload')
    })

    it('returns HTTP 400 when user or email is missing', async () => {
      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({ email_data: { email_action_type: 'signup' } }),
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Missing user email')
    })

    it('returns HTTP 400 when email_action_type is missing', async () => {
      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({ user: { email: 'valid@example.com' }, email_data: {} }),
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Missing email_action_type')
    })
  })

  describe('3. Email Action Support', () => {
    const actions = ['signup', 'recovery', 'email_change', 'magiclink', 'invite', 'reauthentication']

    for (const action of actions) {
      it(`handles auth action "${action}" successfully with valid callback URL`, async () => {
        const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
          body: JSON.stringify({
            user: { id: `usr-${action}`, email: `${action}@example.com`, user_metadata: { full_name: `${action} User` } },
            email_data: { email_action_type: action, token_hash: `th_${action}_123`, redirect_to: `${BRAND.siteUrl}/verified` },
          }),
        })

        const res = await POST(req)
        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data.success).toBe(true)
      })
    }
  })

  describe('4. Provider Failure & Timeout Hardening', () => {
    it('maps provider HTTP 429 rate limit to HTTP 429 hook response', async () => {
      process.env.RESEND_API_KEY = 're_test_key_123'
      ;(process.env as any).NODE_ENV = 'development'

      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ message: 'Too many requests' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-ratelimit', email: 'ratelimit@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_rl_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(429)
      const data = await res.json()
      expect(data.error).toBe('Email delivery failed')
    })

    it('maps provider HTTP 401/403 configuration errors to HTTP 502 hook response', async () => {
      process.env.RESEND_API_KEY = 're_invalid_key'
      ;(process.env as any).NODE_ENV = 'development'

      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ message: 'Invalid API key' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-unauth', email: 'unauth@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_unauth_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(502)
    })

    it('maps provider HTTP 500/503 outage to HTTP 503 hook response', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      ;(process.env as any).NODE_ENV = 'development'

      vi.spyOn(global, 'fetch').mockImplementationOnce(async () => {
        return new Response(JSON.stringify({ message: 'Internal server error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-503', email: 'outage@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_503_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
    })

    it('maps email provider request timeouts (8s) to HTTP 504 Gateway Timeout', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      ;(process.env as any).NODE_ENV = 'development'

      const timeoutErr = new Error('The operation was aborted due to timeout')
      timeoutErr.name = 'TimeoutError'
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(timeoutErr)

      const req = createMockRequest('http://localhost:3000/api/auth/send-email-hook', {
        body: JSON.stringify({
          user: { id: 'usr-timeout', email: 'timeout@example.com' },
          email_data: { email_action_type: 'signup', token_hash: 'th_to_1' },
        }),
      })

      const res = await POST(req)
      expect(res.status).toBe(504)
    })

    it('falls back to Brevo if Resend fails and Brevo is configured', async () => {
      process.env.RESEND_API_KEY = 're_test_key'
      process.env.BREVO_API_KEY = 'xkeysib-brevo-test-key'
      ;(process.env as any).NODE_ENV = 'development'

      let fetchCount = 0
      vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
        fetchCount++
        if (String(url).includes('api.resend.com')) {
          return new Response(JSON.stringify({ message: 'Resend is down' }), { status: 500 })
        }
        if (String(url).includes('api.brevo.com')) {
          return new Response(JSON.stringify({ messageId: '<brevo-fallback-msg-id@brevo>' }), { status: 200 })
        }
        return new Response(JSON.stringify({}), { status: 200 })
      })

      const result = await sendEmail({
        to: 'fallback@example.com',
        subject: 'Test fallback',
        html: '<p>Hello</p>',
        text: 'Hello',
      })

      expect(result.success).toBe(true)
      expect(result.provider).toBe('brevo')
      expect(result.id).toBe('<brevo-fallback-msg-id@brevo>')
      expect(fetchCount).toBe(2)
    })
  })

  describe('5. Logging & PII Masking Safety', () => {
    it('masks email addresses for safe logging without leaking full PII', () => {
      expect(maskEmail('jane.doe@example.com')).toBe('j***e@example.com')
      expect(maskEmail('alex@domain.org')).toBe('a***x@domain.org')
      expect(maskEmail('ab@domain.org')).toBe('*@domain.org')
      expect(maskEmail('')).toBe('***')
    })
  })

  describe('6. Integration with Phase 4 Error Classifier', () => {
    it('maps email provider outages to AUTH_PROVIDER_UNAVAILABLE', () => {
      const error = new Error('Email service temporarily unavailable (503)')
      const classified = classifyAuthError(error)
      expect(classified.code).toBe('AUTH_PROVIDER_UNAVAILABLE')
      expect(classified.retryable).toBe(true)
    })

    it('maps email rate limit responses to AUTH_RATE_LIMITED', () => {
      const error = new Error('Too many requests. Over request rate limit.')
      const classified = classifyAuthError(error)
      expect(classified.code).toBe('AUTH_RATE_LIMITED')
      expect(classified.requiresAction).toBe('wait')
    })

    it('maps email hook network timeouts to AUTH_NETWORK_ERROR', () => {
      const error = new Error('The request timed out.')
      const classified = classifyAuthError(error)
      expect(classified.code).toBe('AUTH_NETWORK_ERROR')
      expect(classified.isNetworkError).toBe(true)
    })
  })
})
