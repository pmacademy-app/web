/**
 * Security events on the server-to-server and abuse paths: email webhooks, cron actor
 * resolution, /api/internal/revalidate, /api/client-errors, the quiz check limiter and
 * the proxy's same-origin check. Each refusal records its event type; the accepted path
 * records nothing. `recordSecurityEvent` is the vi.fn from vitest.setup.ts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { state } = vi.hoisted(() => ({ state: { failKeys: [] as string[] } }))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async (key: string) =>
    state.failKeys.some((prefix) => key.startsWith(prefix))
      ? { success: false, remaining: 0, resetInMs: 60_000 }
      : { success: true, remaining: 4, resetInMs: 60_000 }
  ),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 4, resetInMs: 60_000 })),
}))

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: vi.fn(async (request: Request) =>
    request.headers.get('x-test-learner') ? { id: 'learner-1', email: 'l@example.com' } : null
  ),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => undefined),
  logErrorReport: vi.fn(async () => undefined),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: {
            id: 'mock-user-id',
            email: 'user@example.com',
            app_metadata: {},
            user_metadata: {},
            email_confirmed_at: '2026-01-01T00:00:00Z',
          },
        },
        error: null,
      })),
      refreshSession: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { is_admin: false, curriculum_access_override: false }, error: null }),
        }),
      }),
    }),
  }),
}))

import { recordSecurityEvent } from '@/lib/security/security-events'
import { resolveActor } from '@/lib/api/actor'
import { POST as webhookPOST } from '../../app/api/email/webhooks/route'
import { POST as revalidatePOST } from '../../app/api/internal/revalidate/route'
import { POST as clientErrorsPOST } from '../../app/api/client-errors/route'
import { POST as quizCheckPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/check/route'
import { proxy } from '../../proxy'

const recorded = vi.mocked(recordSecurityEvent)
const types = () => recorded.mock.calls.map((call) => call[0])
const ENV_KEYS = ['RESEND_WEBHOOK_SECRET', 'BREVO_WEBHOOK_SECRET', 'INTERNAL_REVALIDATE_SECRET'] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  state.failKeys = []
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  recorded.mockClear()
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

function post(url: string, body: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.7', ...headers },
    body,
  })
}

describe('POST /api/email/webhooks', () => {
  const url = 'https://prodily.app/api/email/webhooks'
  const svix = () => ({
    'svix-id': 'msg_1',
    'svix-timestamp': String(Math.floor(Date.now() / 1000)),
    'svix-signature': 'v1,forged',
  })

  it('records webhook_auth_failed for a bad Resend signature', async () => {
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('resend-secret').toString('base64')}`
    const res = await webhookPOST(post(url, '{}', svix()))
    expect(res.status).toBe(401)
    expect(recorded).toHaveBeenCalledWith('webhook_auth_failed', { ipBucket: '198.51.100.7', path: '/api/email/webhooks' })
  })

  it('records webhook_auth_failed for a wrong Brevo secret', async () => {
    process.env.BREVO_WEBHOOK_SECRET = 'brevo-secret'
    const res = await webhookPOST(post(url, '{}', { 'x-brevo-webhook-secret': 'brevo-wrong!' }))
    expect(res.status).toBe(401)
    expect(types()).toEqual(['webhook_auth_failed'])
  })

  it('records webhook_auth_failed when authentication headers are missing', async () => {
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('resend-secret').toString('base64')}`
    const res = await webhookPOST(post(url, '{}'))
    expect(res.status).toBe(401)
    expect(types()).toEqual(['webhook_auth_failed'])
  })

  it('records nothing once the request authenticates', async () => {
    process.env.BREVO_WEBHOOK_SECRET = 'brevo-secret'
    const res = await webhookPOST(post(url, 'not json', { 'x-brevo-webhook-secret': 'brevo-secret' }))
    expect(res.status).toBe(400)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('cron actor resolution (lib/api/actor.ts)', () => {
  const cronRequest = (auth?: string) =>
    new Request('https://prodily.app/api/cron/cleanup', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.7', ...(auth ? { authorization: auth } : {}) },
    })

  it('records cron_auth_failed once for a wrong bearer', async () => {
    const request = cronRequest('Bearer wrong-secret')
    const first = await resolveActor(request, { allow: ['cron'] })
    await resolveActor(request, { allow: ['cron'] })
    expect(first.ok).toBe(false)
    expect(recorded).toHaveBeenCalledTimes(1)
    expect(recorded).toHaveBeenCalledWith('cron_auth_failed', {
      ipBucket: '198.51.100.7',
      path: 'https://prodily.app/api/cron/cleanup',
    })
  })

  it('records cron_auth_failed for a missing bearer', async () => {
    const result = await resolveActor(cronRequest(), { allow: ['cron'] })
    expect(result.ok).toBe(false)
    expect(types()).toEqual(['cron_auth_failed'])
  })

  it('records nothing for the right bearer', async () => {
    const result = await resolveActor(cronRequest(`Bearer ${process.env.CRON_SECRET}`), { allow: ['cron'] })
    expect(result.ok).toBe(true)
    expect(recorded).not.toHaveBeenCalled()
  })

  it('records nothing when a learner-only policy refuses (not a cron credential)', async () => {
    const result = await resolveActor(cronRequest(), { allow: ['learner'] })
    expect(result.ok).toBe(false)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/internal/revalidate', () => {
  const url = 'https://prodily.app/api/internal/revalidate'

  it('records internal_revalidate_auth_failed for a wrong bearer', async () => {
    process.env.INTERNAL_REVALIDATE_SECRET = 'revalidate-secret'
    const res = await revalidatePOST(post(url, '{}', { authorization: 'Bearer nope' }))
    expect(res.status).toBe(401)
    expect(recorded).toHaveBeenCalledWith('internal_revalidate_auth_failed', {
      ipBucket: '198.51.100.7',
      path: '/api/internal/revalidate',
    })
  })

  it('records nothing for the right bearer', async () => {
    process.env.INTERNAL_REVALIDATE_SECRET = 'revalidate-secret'
    const res = await revalidatePOST(post(url, '{}', { authorization: 'Bearer revalidate-secret' }))
    expect(res.status).toBe(400)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/client-errors', () => {
  const url = 'https://prodily.app/api/client-errors'

  it('records client_errors_flood when the global cap is hit', async () => {
    state.failKeys = ['client_errors:global']
    const res = await clientErrorsPOST(post(url, '{}'))
    expect(res.status).toBe(429)
    expect(recorded).toHaveBeenCalledWith('client_errors_flood', { ipBucket: '198.51.100.7', path: '/api/client-errors' })
  })

  it('records nothing for a per-IP refusal or an accepted report', async () => {
    state.failKeys = ['client_errors:198']
    expect((await clientErrorsPOST(post(url, '{}'))).status).toBe(429)
    state.failKeys = []
    expect((await clientErrorsPOST(post(url, 'not json'))).status).toBe(400)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('POST /api/v2/lessons/[lessonId]/quiz/check', () => {
  const lessonId = 'les_abc'
  const body = JSON.stringify({ questionId: 'q-les_abc-1', answer: 0, attemptId: 'attempt_12345678' })
  const call = () =>
    quizCheckPOST(post(`https://prodily.app/api/v2/lessons/${lessonId}/quiz/check`, body, { 'x-test-learner': '1' }), {
      params: Promise.resolve({ lessonId }),
    })

  it('records quiz_check_rate_limited on a 429', async () => {
    state.failKeys = ['lesson_quiz_check_']
    const res = await call()
    expect(res.status).toBe(429)
    expect(recorded).toHaveBeenCalledWith('quiz_check_rate_limited', {
      subject: 'learner-1',
      path: `https://prodily.app/api/v2/lessons/${lessonId}/quiz/check`,
    })
  })

  it('records nothing when the limiter allows the check', async () => {
    const res = await call()
    expect(res.status).not.toBe(429)
    expect(recorded).not.toHaveBeenCalled()
  })
})

describe('proxy same-origin check', () => {
  it('records origin_rejected for a cross-origin cookie write', async () => {
    const res = await proxy(
      new NextRequest('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=t', origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.7' },
      })
    )
    expect(res.status).toBe(403)
    expect(recorded).toHaveBeenCalledWith('origin_rejected', { ipBucket: '198.51.100.7', path: '/api/settings/profile' })
  })

  it('records nothing for a same-origin write', async () => {
    await proxy(
      new NextRequest('https://prodily.app/api/settings/profile', {
        method: 'POST',
        headers: { cookie: 'sb-access-token=t', origin: 'https://prodily.app' },
      })
    )
    expect(recorded).not.toHaveBeenCalled()
  })

  it('is safe in the proxy: Next 16 runs proxy.ts on the Node.js runtime', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../../proxy.ts'), 'utf8')
    expect(source).not.toMatch(/export const runtime\s*=\s*['"]edge['"]/)
    expect(source).toContain("import { recordSecurityEvent } from '@/lib/security/security-events'")
  })
})
