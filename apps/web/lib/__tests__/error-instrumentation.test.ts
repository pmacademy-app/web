/**
 * Instrumentation coverage for the failure paths fixed in P2-P5.
 *
 * The regression that matters most here is B4: `lib/email.ts` carries signup
 * verification and password reset via the Supabase Auth hook, and it emitted only a
 * console.error on failure. Zero rows in `system_errors`, zero admin alerts — during a
 * Brevo quota exhaustion an operator would have seen a green all-clear on /admin/system.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Signature declared via generic so `mock.calls[n][0]` is a known shape rather than
// an empty tuple, without an unused parameter.
type ReportArg = Record<string, unknown>
const logErrorReport = vi.fn<(report: ReportArg) => Promise<string>>(async () => 'incident-1')
vi.mock('../monitoring/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../monitoring/logger')>()
  return { ...actual, logErrorReport }
})

import { sendEmail } from '@/lib/email'
import { sendEmailWithFailover, globalProviderRegistry } from '../notifications/providers'

interface StubResponse {
  ok: boolean
  status: number
  body?: Record<string, unknown>
}

function stubFetch(responses: { brevo?: StubResponse; resend?: StubResponse }) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string }) => {
      if ((init?.method || 'GET').toUpperCase() !== 'POST') {
        return { ok: true, status: 200, json: async () => ({}), headers: new Headers() }
      }
      const host = String(url).includes('brevo.com') ? 'brevo' : 'resend'
      calls.push(host)
      const r = responses[host] ?? { ok: true, status: 200, body: { messageId: 'ok', id: 'ok' } }
      return { ok: r.ok, status: r.status, json: async () => r.body ?? {} }
    })
  )
  return calls
}

/**
 * Waits for the `void`-ed instrumentation promise to settle.
 *
 * The reporting helpers chain through two dynamic imports before calling the logger,
 * so a single tick is not enough and a fixed sleep would be flaky. Poll until the
 * expected number of reports arrives, with a bounded timeout.
 */
async function waitForReports(count: number, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (logErrorReport.mock.calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

/** Lets any pending instrumentation settle when we expect NO report. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('instrumentation — auth/transactional email delivery failures (B4)', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_test_key'
    delete process.env.RESEND_API_KEY // no failover target — isolate the primary failure
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  it('reports a quota rejection as provider_quota with a masked recipient', async () => {
    stubFetch({ brevo: { ok: false, status: 402, body: { message: 'Plan sending limit reached' } } })

    await sendEmail({ to: 'learner@example.com', subject: 's', html: '<p>h</p>', text: 't' })
    await waitForReports(1)

    expect(logErrorReport).toHaveBeenCalledTimes(1)
    const report = logErrorReport.mock.calls[0][0]
    expect(report.domain).toBe('email')
    expect(report.kind).toBe('provider_quota')
    expect(report.operation).toBe('email.direct_send')
    expect((report.provider as Record<string, unknown>).name).toBe('brevo')
    expect((report.provider as Record<string, unknown>).statusCode).toBe(402)
  })

  it('never puts the raw recipient address in the report', async () => {
    stubFetch({ brevo: { ok: false, status: 500, body: { message: 'boom' } } })

    await sendEmail({ to: 'jane.doe@example.com', subject: 's', html: '<p>h</p>', text: 't' })
    await waitForReports(1)

    const report = logErrorReport.mock.calls[0][0]
    const subject = report.subject as Record<string, unknown>
    expect(subject.maskedEmail).toBe('j***e@example.com')
    expect(JSON.stringify(report)).not.toContain('jane.doe@example.com')
  })

  it('keeps the summary stable and free of interpolated values', async () => {
    // Summary must not vary per occurrence, or every send gets its own fingerprint and
    // one outage becomes one alert per affected user. Recipient, provider message and
    // status all belong in subject/provider/details instead.
    // (Fingerprint collapsing itself is asserted directly in error-taxonomy.test.ts.)
    stubFetch({ brevo: { ok: false, status: 500, body: { message: 'boom-12345' } } })

    await sendEmail({ to: 'a@example.com', subject: 's', html: '<p>h</p>', text: 't' })
    await waitForReports(1)

    const report = logErrorReport.mock.calls[0][0]
    const summary = String(report.summary)
    expect(summary).not.toMatch(/@/)
    expect(summary).not.toMatch(/\d/)
    expect(summary).not.toContain('boom-12345')
    expect((report.details as Record<string, unknown>).providerMessage).toContain('boom-12345')
  })

  it('does not report anything when the send succeeds', async () => {
    stubFetch({ brevo: { ok: true, status: 200, body: { messageId: 'm1' } } })

    await sendEmail({ to: 'learner@example.com', subject: 's', html: '<p>h</p>', text: 't' })
    await settle()

    expect(logErrorReport).not.toHaveBeenCalled()
  })
})

describe('instrumentation — failover exhaustion escalates', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_test_key'
    process.env.RESEND_API_KEY = 'resend_test_key'
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  const payload = {
    recipient: { userId: 'user-1', email: 'learner@example.com' },
    channel: 'email' as const,
    templateKey: 'auth.welcome',
    templateVersion: 1,
    variables: { subject: 's', html: '<p>h</p>', text: 't' },
  }

  it('raises an allProvidersFailed incident when both providers refuse', async () => {
    stubFetch({
      brevo: { ok: false, status: 500, body: { message: 'down' } },
      resend: { ok: false, status: 500, body: { message: 'also down' } },
    })

    const result = await sendEmailWithFailover(payload, globalProviderRegistry)
    // Two provider reports plus the exhaustion report.
    await waitForReports(3)

    expect(result.success).toBe(false)
    const exhausted = logErrorReport.mock.calls
      .map((c) => c[0])
      .find((r) => r.operation === 'email.failover_exhausted')

    expect(exhausted).toBeDefined()
    expect(exhausted?.allProvidersFailed).toBe(true)
    expect(exhausted?.domain).toBe('email')
  })

  it('does not raise the exhaustion incident when failover succeeds', async () => {
    stubFetch({
      brevo: { ok: false, status: 500, body: { message: 'down' } },
      resend: { ok: true, status: 200, body: { id: 'r1' } },
    })

    const result = await sendEmailWithFailover(payload, globalProviderRegistry)
    await settle()

    expect(result.success).toBe(true)
    const exhausted = logErrorReport.mock.calls
      .map((c) => c[0])
      .find((r) => r.operation === 'email.failover_exhausted')
    expect(exhausted).toBeUndefined()
  })
})
