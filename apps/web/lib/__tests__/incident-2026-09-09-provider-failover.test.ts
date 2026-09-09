/**
 * Regression coverage for the provider half of the 2026-09-09 incident.
 *
 * Brevo's credit allowance was exhausted and Resend — configured, healthy, holding a
 * valid key — never took over. The failover machinery itself was fine; its INPUT was
 * wrong. `classifyProviderFailure()` looked only at the HTTP status, and Brevo answers
 * `POST /v3/smtp/email` with an ordinary **HTTP 400** carrying
 * `{"code":"not_enough_credits"}` when it is out of credit. 400 is classified
 * `permanent` ("both providers would reject this identically"), so the fallback was
 * deliberately skipped every single time.
 *
 * These tests pin the whole state machine, not just the happy path: which provider is
 * actually invoked under each failure classification, that a success never produces a
 * second send, and that an exhausted provider stops being selected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sendEmail } from '@/lib/email'
import {
  classifyProviderFailure,
  isCapacityExhaustionSignal,
} from '@/lib/notifications/providers/failure-classification'
import {
  ProviderRegistry,
  sendEmailWithFailover,
  type NotificationProvider,
  type ProviderSendPayload,
  type ProviderSendResult,
} from '@/lib/notifications/providers'

// ─────────────────────────────────────────────────────────────────────────────
// Provider test harness
// ─────────────────────────────────────────────────────────────────────────────

/** One scripted provider response. */
type Scenario =
  | { kind: 'ok'; id?: string }
  | { kind: 'http'; status: number; body?: Record<string, unknown> }
  | { kind: 'timeout' }
  | { kind: 'network'; message?: string }

function scenarioToFetchResponse(scenario: Scenario): Response {
  switch (scenario.kind) {
    case 'ok':
      return new Response(JSON.stringify({ messageId: scenario.id ?? 'msg-1', id: scenario.id ?? 'msg-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    case 'http':
      return new Response(JSON.stringify(scenario.body ?? { message: `error ${scenario.status}` }), {
        status: scenario.status,
        headers: { 'Content-Type': 'application/json' },
      })
    default:
      throw new Error('not an HTTP scenario')
  }
}

/**
 * Routes fetch by provider host and records the call order.
 *
 * Everything that is not a provider host (the Supabase queries the governed paths
 * make) falls through to the suite's default handler, so the assertions below are
 * about provider calls only.
 */
function harness(script: { brevo?: Scenario; resend?: Scenario }) {
  const calls: string[] = []
  const original = global.fetch

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: unknown) => {
      const url = String(input)
      const which = url.includes('brevo.com') ? 'brevo' : url.includes('resend.com') ? 'resend' : null
      if (!which) return (original as (i: unknown, n?: unknown) => Promise<Response>)(input, init)

      calls.push(which)
      const scenario = script[which]
      if (!scenario) throw new Error(`No scenario scripted for ${which}`)

      if (scenario.kind === 'timeout') {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }
      if (scenario.kind === 'network') {
        throw new Error(scenario.message ?? 'fetch failed: ECONNREFUSED')
      }
      return scenarioToFetchResponse(scenario)
    })
  )

  return { calls }
}

describe('Incident 2026-09-09 — provider failure classification', () => {
  describe('capacity exhaustion is recognized by the provider error code, not only the status', () => {
    it('Brevo HTTP 400 + not_enough_credits IS failover-eligible (the exact 2026-09-09 miss)', () => {
      expect(classifyProviderFailure(400, 'not_enough_credits Not enough credits')).toBe('failover')
      expect(isCapacityExhaustionSignal(400, 'not_enough_credits')).toBe(true)
    })

    it('recognizes the other spellings both providers use for "out of capacity"', () => {
      for (const code of [
        'not_enough_credit',
        'plan_limit_reached',
        'daily_limit_exceeded',
        'quota_exceeded',
        'rate_limit_exceeded',
        'too_many_requests',
        'account throttled',
      ]) {
        expect(classifyProviderFailure(400, code)).toBe('failover')
      }
    })

    it('does NOT turn every 4xx into a failover — a plain bad request stays permanent', () => {
      expect(classifyProviderFailure(400, 'Invalid email address')).toBe('permanent')
      expect(classifyProviderFailure(400)).toBe('permanent')
      expect(classifyProviderFailure(401, 'Invalid API key')).toBe('permanent')
      expect(classifyProviderFailure(403, 'Forbidden')).toBe('permanent')
      expect(classifyProviderFailure(422, 'Unprocessable')).toBe('permanent')
    })

    it('keeps the status-code rules that were already correct', () => {
      expect(classifyProviderFailure(402)).toBe('failover')
      expect(classifyProviderFailure(429)).toBe('failover')
      expect(classifyProviderFailure(408)).toBe('failover')
      expect(classifyProviderFailure(500)).toBe('failover')
      expect(classifyProviderFailure(503)).toBe('failover')
      expect(classifyProviderFailure(undefined)).toBe('failover')
      expect(classifyProviderFailure(418)).toBe('retry')
    })
  })
})

describe('Incident 2026-09-09 — sendEmail() failover state machine', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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
  })

  const message = { to: 'learner@example.com', subject: 's', html: '<p>h</p>', text: 't' }

  // TEST 6
  it('Brevo 402 (no credits) -> Resend delivers', async () => {
    const { calls } = harness({ brevo: { kind: 'http', status: 402 }, resend: { kind: 'ok', id: 'r-402' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
    expect(result.provider).toBe('resend')
  })

  // TEST 7
  it('Brevo 429 (rate limited) -> Resend delivers', async () => {
    const { calls } = harness({ brevo: { kind: 'http', status: 429 }, resend: { kind: 'ok', id: 'r-429' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
    expect(result.provider).toBe('resend')
  })

  // TEST 6b — the actual production shape of Brevo credit exhaustion.
  it('Brevo 400 + not_enough_credits -> Resend delivers (previously refused failover)', async () => {
    const { calls } = harness({
      brevo: { kind: 'http', status: 400, body: { code: 'not_enough_credits', message: 'Not enough credits' } },
      resend: { kind: 'ok', id: 'r-credits' },
    })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
    expect(result.provider).toBe('resend')
  })

  // TEST 8
  it('Brevo 500 -> Resend delivers', async () => {
    const { calls } = harness({ brevo: { kind: 'http', status: 500 }, resend: { kind: 'ok', id: 'r-500' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
  })

  it('Brevo timeout -> Resend delivers', async () => {
    const { calls } = harness({ brevo: { kind: 'timeout' }, resend: { kind: 'ok' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
  })

  it('Brevo network failure -> Resend delivers', async () => {
    const { calls } = harness({ brevo: { kind: 'network' }, resend: { kind: 'ok' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(true)
  })

  // TEST 9
  it('Brevo permanent 4xx does NOT blindly fail over', async () => {
    for (const status of [400, 401, 403, 422]) {
      const { calls } = harness({
        brevo: { kind: 'http', status, body: { message: 'Invalid recipient' } },
        resend: { kind: 'ok' },
      })
      const result = await sendEmail(message)

      expect(calls).toEqual(['brevo'])
      expect(result.success).toBe(false)
      expect(result.provider).toBe('brevo')
      vi.unstubAllGlobals()
    }
  })

  // TEST 10
  it('Brevo success -> Resend is never called', async () => {
    const { calls } = harness({ brevo: { kind: 'ok', id: 'b-1' } })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo'])
    expect(result.success).toBe(true)
    expect(result.provider).toBe('brevo')
  })

  // TEST 11 — an accepted-but-unidentifiable response must not be re-sent elsewhere.
  it('Brevo 200 with an empty/ambiguous body is treated as accepted, NOT double-sent', async () => {
    const { calls } = harness({
      brevo: { kind: 'http', status: 200, body: {} },
      resend: { kind: 'ok' },
    })
    const result = await sendEmail(message)

    // Exactly one provider call. Brevo answered 2xx, so the message may well be on its
    // way; sending it again through Resend would duplicate a real delivery and spend a
    // second credit for one logical email.
    expect(calls).toEqual(['brevo'])
    expect(result.success).toBe(true)
    expect(result.provider).toBe('brevo')
  })

  // TEST 12
  it('Resend failing after a Brevo failover reports failure without a third attempt', async () => {
    const { calls } = harness({
      brevo: { kind: 'http', status: 402 },
      resend: { kind: 'http', status: 500, body: { message: 'Resend down' } },
    })
    const result = await sendEmail(message)

    expect(calls).toEqual(['brevo', 'resend'])
    expect(result.success).toBe(false)
    expect(result.provider).toBe('resend')
  })

  it('never falls back onto the provider it was told to skip', async () => {
    // The gateway has established Brevo is spent and directs the send to Resend.
    // A Resend failure must not then bounce back onto the provider we skipped.
    const { calls } = harness({ resend: { kind: 'http', status: 500 }, brevo: { kind: 'ok' } })
    const result = await sendEmail({ ...message, preferProvider: 'resend' })

    expect(calls).toEqual(['resend'])
    expect(result.success).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Registry path (the queue processor's dispatcher)
// ─────────────────────────────────────────────────────────────────────────────

/** A provider whose every response is scripted, so the state machine is observable. */
function fakeProvider(name: 'brevo' | 'resend', results: ProviderSendResult[]): NotificationProvider & { calls: number } {
  let i = 0
  return {
    name,
    supportedChannels: ['email'],
    calls: 0,
    async send(_payload: ProviderSendPayload) {
      ;(this as { calls: number }).calls++
      return results[Math.min(i++, results.length - 1)]
    },
    isConfigured: () => true,
    async healthCheck() {
      return { providerName: name, isHealthy: true }
    },
  }
}

function ok(name: 'brevo' | 'resend'): ProviderSendResult {
  return { success: true, providerName: name, externalId: `${name}-ok`, statusCode: 200, timestamp: new Date().toISOString() }
}

function fail(
  name: 'brevo' | 'resend',
  statusCode: number,
  providerCode?: string
): ProviderSendResult {
  return {
    success: false,
    providerName: name,
    error: providerCode ?? `HTTP ${statusCode}`,
    statusCode,
    providerCode,
    timestamp: new Date().toISOString(),
  }
}

describe('Incident 2026-09-09 — sendEmailWithFailover() (queue dispatch path)', () => {
  const originalEnv = { ...process.env }
  const payload: ProviderSendPayload = {
    recipient: { userId: 'u1', email: 'learner@example.com' },
    channel: 'email',
    templateKey: 'auth.welcome',
    templateVersion: 1,
    variables: { subject: 's', html: '<p>h</p>', text: 't' },
  }

  beforeEach(() => {
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_test_key'
    process.env.RESEND_API_KEY = 'resend_test_key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  function registryOf(brevo: NotificationProvider, resend: NotificationProvider) {
    const registry = new ProviderRegistry()
    registry.registerProvider(brevo)
    registry.registerProvider(resend)
    return registry
  }

  it('Brevo 402 -> Resend delivers, and both attempts are recorded', async () => {
    const brevo = fakeProvider('brevo', [fail('brevo', 402, 'not_enough_credits')])
    const resend = fakeProvider('resend', [ok('resend')])

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('resend')
    expect(result.failedOver).toBe(true)
    expect(result.attempts).toHaveLength(2)
    expect(result.attempts.map((a) => a.providerName)).toEqual(['brevo', 'resend'])
  })

  it('Brevo 400 + not_enough_credits -> Resend delivers', async () => {
    const brevo = fakeProvider('brevo', [fail('brevo', 400, 'not_enough_credits')])
    const resend = fakeProvider('resend', [ok('resend')])

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('resend')
    expect(resend.calls).toBe(1)
  })

  it('Brevo success -> Resend is never invoked', async () => {
    const brevo = fakeProvider('brevo', [ok('brevo')])
    const resend = fakeProvider('resend', [ok('resend')])

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend))

    expect(result.success).toBe(true)
    expect(result.provider).toBe('brevo')
    expect(result.failedOver).toBe(false)
    expect(resend.calls).toBe(0)
    expect(result.attempts).toHaveLength(1)
  })

  it('Brevo permanent 401 -> Resend is never invoked', async () => {
    const brevo = fakeProvider('brevo', [fail('brevo', 401, 'Invalid API key')])
    const resend = fakeProvider('resend', [ok('resend')])

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend))

    expect(result.success).toBe(false)
    expect(resend.calls).toBe(0)
    expect(result.failedOver).toBe(false)
  })

  it('both providers failing produces one final failure naming both — never a third attempt', async () => {
    const brevo = fakeProvider('brevo', [fail('brevo', 402, 'not_enough_credits')])
    const resend = fakeProvider('resend', [fail('resend', 500, 'Internal error')])

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend))

    expect(result.success).toBe(false)
    expect(result.attempts).toHaveLength(2)
    expect(brevo.calls).toBe(1)
    expect(resend.calls).toBe(1)
    expect(result.error).toContain('brevo')
    expect(result.error).toContain('resend')
  })

  it('an unconfigured secondary is not attempted (an unconfigured provider reports a fake success)', async () => {
    const brevo = fakeProvider('brevo', [fail('brevo', 402, 'not_enough_credits')])
    const resend = { ...fakeProvider('resend', [ok('resend')]), isConfigured: () => false }

    const result = await sendEmailWithFailover(payload, registryOf(brevo, resend as NotificationProvider))

    expect(result.success).toBe(false)
    expect(result.error).toContain('no configured failover provider')
  })
})
