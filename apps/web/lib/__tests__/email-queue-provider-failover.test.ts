/**
 * RED-PHASE COVERAGE (audit B1, B2, B3) — these tests are expected to FAIL until
 * provider failover is implemented in the queue path.
 *
 * `processEmailQueue()` resolves exactly ONE provider via `getActiveEmailProvider()`
 * and sends through it. When that provider fails — for any reason, including Brevo
 * credit exhaustion — the item is deferred by `handleRetryableFailure()` and the next
 * run resolves the SAME provider again. The second registered provider is never
 * attempted. That is the real reason "Resend fallback isn't working": the fallback
 * logic in `lib/email.ts` is not on this code path at all.
 *
 * Design note: the provider layer (`lib/notifications/providers`) is deliberately NOT
 * mocked here. Faking `getActiveEmailProvider` would test our own mock instead of the
 * real selection-and-failover behavior. Only true boundaries are faked — the database,
 * the automations/settings reads, and template rendering — so failover is exercised
 * end-to-end at the `fetch` boundary, exactly as it runs in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

// NOTE: vi.mock() paths resolve relative to THIS file (apps/web/lib/__tests__/),
// not relative to processor.ts (apps/web/lib/notifications/queue/).
vi.mock('../notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabled: vi.fn(() => true),
    // The processor reads flags through the DB-backed async path so an admin kill
    // switch takes effect across serverless instances; these suites are not about
    // flag resolution, so both entry points simply report "enabled".
    isEnabledAsync: vi.fn(async () => true),
    ensureHydrated: vi.fn(async () => undefined),
  },
}))

// Faked to keep the daily-quota + global-pause reads deterministic, and — importantly —
// to keep `EmailAutomationsService.getState()` from issuing its own un-timed
// `GET https://api.resend.com/emails` usage probe. That probe shares a URL with the
// Resend *send* endpoint, so leaving it live would pollute the provider call counts
// these tests assert on.
const automationsState = { globalPause: false, dailyLimit: 1000 }
vi.mock('../notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => automationsState),
    isAutomationEnabled: vi.fn(async () => true),
  },
}))

vi.mock('../../emails', () => ({
  renderEmailTemplate: vi.fn(async () => ({
    html: '<p>Welcome</p>',
    text: 'Welcome',
    subject: 'Welcome to Prodily',
  })),
}))

import { processEmailQueue } from '../notifications/queue/processor'
import { getActiveEmailProvider, globalProviderRegistry } from '../notifications/providers'
import { sendEmail } from '@/lib/email'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeQueueRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'queue-row-1',
    user_id: 'user-1',
    to_email: 'learner@example.com',
    to_name: 'Learner',
    template_key: 'auth.welcome',
    template_variables: {},
    attempt_count: 1,
    max_attempts: 3,
    ...overrides,
  }
}

/**
 * Minimal fake Supabase client. Captures every `email_queue` update payload so the
 * final row state can be asserted, and answers the handful of reads the processor
 * and the structured logger perform.
 */
function buildFakeSupabase(opts: {
  claimedRows: Array<Record<string, unknown>>
  onQueueUpdate?: (payload: Record<string, unknown>) => void
}) {
  const rpc = vi.fn(async (name: string) => {
    if (name === 'claim_email_queue_items') return { data: opts.claimedRows, error: null }
    if (name === 'increment_daily_email_quota') return { data: true, error: null }
    return { data: null, error: null }
  })

  // Terminal chain node that resolves for any read shape the processor or logger uses.
  const readChain = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {}
    for (const method of ['select', 'eq', 'gte', 'in', 'order', 'limit']) {
      node[method] = () => readChain()
    }
    node.maybeSingle = async () => ({ data: null, error: null })
    node.single = async () => ({ data: null, error: null })
    node.then = undefined
    return node
  }

  const from = (table: string) => {
    if (table === 'email_queue') {
      return {
        ...readChain(),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => {
            opts.onQueueUpdate?.(payload)
            return { data: null, error: null }
          },
        }),
      }
    }
    // email_suppressions, notification_events, email_dead_letter, system_errors, users
    // `insert` must stay chainable: the structured logger does
    // `.insert(...).select('id').maybeSingle()`, and a bare promise here would throw
    // inside logSystemError and add noise that looks like a broken harness.
    return {
      ...readChain(),
      insert: () => ({ ...readChain(), then: undefined }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
      upsert: async () => ({ data: null, error: null }),
    }
  }

  return { rpc, from } as unknown as SupabaseClient<Database>
}

interface ProviderResponse {
  ok: boolean
  status: number
  body?: Record<string, unknown>
  /** Throw instead of responding — models a timeout or a socket-level failure. */
  throws?: Error
}

const OK_BREVO: ProviderResponse = { ok: true, status: 200, body: { messageId: 'brevo-msg-1' } }
const OK_RESEND: ProviderResponse = { ok: true, status: 200, body: { id: 'resend-msg-1' } }

/**
 * Stubs global fetch and records, in order, which provider host each SEND (POST) hit.
 * Non-POST calls are recorded separately so a stray probe can never be mistaken for
 * a delivery attempt.
 */
function stubProviderFetch(responses: { brevo?: ProviderResponse; resend?: ProviderResponse }) {
  const calls: string[] = []
  const nonSendCalls: string[] = []

  const respond = (r: ProviderResponse) => {
    if (r.throws) throw r.throws
    return { ok: r.ok, status: r.status, json: async () => r.body ?? {} }
  }

  const fn = vi.fn(async (url: string, init?: { method?: string }) => {
    const isSend = (init?.method || 'GET').toUpperCase() === 'POST'
    const host = String(url).includes('brevo.com') ? 'brevo' : String(url).includes('resend.com') ? 'resend' : 'other'

    if (!isSend) {
      nonSendCalls.push(host)
      return { ok: true, status: 200, json: async () => ({}), headers: new Headers() }
    }

    if (host === 'brevo') {
      calls.push('brevo')
      return respond(responses.brevo ?? OK_BREVO)
    }
    if (host === 'resend') {
      calls.push('resend')
      return respond(responses.resend ?? OK_RESEND)
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })

  vi.stubGlobal('fetch', fn)
  return { fn, calls, nonSendCalls }
}

function timeoutError() {
  const err = new Error('The operation was aborted due to timeout')
  err.name = 'TimeoutError'
  return err
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('processEmailQueue — Brevo/Resend provider failover', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.PRIMARY_EMAIL_PROVIDER = 'brevo'
    process.env.BREVO_API_KEY = 'brevo_test_key'
    process.env.RESEND_API_KEY = 'resend_test_key'
    process.env.BREVO_SIMULATE = 'false'
    process.env.RESEND_SIMULATE = 'false'
    // The provider classes short-circuit to a simulated success when NODE_ENV === 'test'.
    // Force 'production' so the real HTTP path (and therefore the real failover path) runs.
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    automationsState.globalPause = false
    automationsState.dailyLimit = 1000
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.unstubAllGlobals()
  })

  /** Runs one queue item against the given provider responses and returns what happened. */
  async function runOneItem(responses: { brevo?: ProviderResponse; resend?: ProviderResponse }) {
    const updates: Record<string, unknown>[] = []
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow()],
      onQueueUpdate: (p) => updates.push(p),
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const probe = stubProviderFetch(responses)
    const result = await processEmailQueue(10)

    return { result, updates, calls: probe.calls, nonSendCalls: probe.nonSendCalls }
  }

  describe('Brevo unavailable → Resend must take over', () => {
    it('Brevo 402 (credits exhausted) -> falls back to Resend and delivers', async () => {
      const { result, updates, calls } = await runOneItem({
        brevo: { ok: false, status: 402, body: { message: 'Plan sending limit reached' } },
      })

      // The incident case: Brevo is out of credits, Resend is healthy and idle.
      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.delivered).toBe(1)
      expect(result.failed).toBe(0)
      expect(updates.some((u) => u.status === 'delivered')).toBe(true)
    })

    it('Brevo 429 (daily quota / rate limited) -> falls back to Resend and delivers', async () => {
      const { result, updates, calls } = await runOneItem({
        brevo: { ok: false, status: 429, body: { message: 'Too many requests — daily quota exceeded' } },
      })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.delivered).toBe(1)
      expect(updates.some((u) => u.status === 'delivered')).toBe(true)
    })

    it('Brevo 500 (provider outage) -> falls back to Resend and delivers', async () => {
      const { result, calls } = await runOneItem({
        brevo: { ok: false, status: 500, body: { message: 'Internal Server Error' } },
      })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.delivered).toBe(1)
    })

    it('Brevo timeout -> falls back to Resend and delivers', async () => {
      const { result, calls } = await runOneItem({
        brevo: { ok: false, status: 0, throws: timeoutError() },
      })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.delivered).toBe(1)
    })
  })

  describe('Reverse direction — Resend primary', () => {
    beforeEach(() => {
      process.env.PRIMARY_EMAIL_PROVIDER = 'resend'
    })

    it('Resend failure -> falls back to Brevo and delivers', async () => {
      const { result, calls } = await runOneItem({
        resend: { ok: false, status: 500, body: { message: 'Internal error' } },
      })

      expect(calls).toEqual(['resend', 'brevo'])
      expect(result.delivered).toBe(1)
    })
  })

  describe('Failover is bounded and honestly reported', () => {
    it('attempts the secondary provider exactly once — never a third send', async () => {
      const { calls } = await runOneItem({
        brevo: { ok: false, status: 500, body: { message: 'Internal Server Error' } },
        resend: { ok: false, status: 500, body: { message: 'Internal error' } },
      })

      expect(calls).toHaveLength(2)
      expect(calls.filter((c) => c === 'brevo')).toHaveLength(1)
      expect(calls.filter((c) => c === 'resend')).toHaveLength(1)
    })

    it('both providers fail -> item is not delivered and both failures are surfaced', async () => {
      const { result, updates, calls } = await runOneItem({
        brevo: { ok: false, status: 402, body: { message: 'Plan sending limit reached' } },
        resend: { ok: false, status: 500, body: { message: 'Internal error' } },
      })

      expect(calls).toEqual(['brevo', 'resend'])
      expect(result.delivered).toBe(0)
      expect(result.failed).toBe(1)
      expect(updates.some((u) => u.status === 'delivered')).toBe(false)

      // An admin looking at this row must be able to tell that BOTH providers were
      // tried and why each one refused — not just the primary's error.
      const failureUpdate = updates.find((u) => u.status === 'retrying' || u.status === 'dead_letter')
      expect(failureUpdate).toBeDefined()
      const message = String(failureUpdate?.error_message ?? '').toLowerCase()
      expect(message).toContain('brevo')
      expect(message).toContain('resend')
    })

    it('a healthy primary is never double-sent — no failover on success', async () => {
      const { result, calls } = await runOneItem({})

      expect(calls).toEqual(['brevo'])
      expect(result.delivered).toBe(1)
    })
  })
})

// ─── Primary-provider resolution parity (audit B3) ────────────────────────────

describe('Primary provider resolution — lib/email.ts vs lib/notifications/providers', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv }
    delete process.env.PRIMARY_EMAIL_PROVIDER // the case under test: unset
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

  it('both stacks pick the SAME primary when PRIMARY_EMAIL_PROVIDER is unset', async () => {
    // Queue/provider stack: read the resolved provider directly.
    const registryPrimary = getActiveEmailProvider(globalProviderRegistry).name

    // Auth/direct stack: `lib/email.ts` resolves its primary inline, so observe it
    // behaviorally — whichever host it contacts first IS its primary.
    const probe = stubProviderFetch({})
    await sendEmail({ to: 'learner@example.com', subject: 's', html: '<p>h</p>', text: 't' })
    const directPrimary = probe.calls[0]

    expect(directPrimary).toBeDefined()
    // Today these disagree: lib/email.ts:81 prefers Resend when a key is present,
    // while providers/index.ts:49 prefers Brevo. Auth mail and queued mail can leave
    // via different providers — different sender identity, DKIM alignment and webhooks.
    expect(directPrimary).toBe(registryPrimary)
  })
})
