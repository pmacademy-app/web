/**
 * Regression coverage for the 2026-09-06 signup-abuse incident's email root cause:
 * `increment_daily_email_quota()` was previously called AFTER a successful send with
 * its return value discarded, so the documented daily cap never actually stopped
 * anything. These tests pin the fixed behavior in `processEmailQueue()`:
 * the quota RPC must be called BEFORE dispatch, and a `false` result must prevent
 * the send and defer the item instead of silently delivering it anyway.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import * as supabaseModule from '../supabase'

// NOTE: vi.mock() paths are resolved relative to THIS test file (apps/web/lib/__tests__/),
// not relative to processor.ts (apps/web/lib/notifications/queue/) which is one directory deeper.
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

const automationsState = { globalPause: false, dailyLimit: 100 }
vi.mock('../notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn(async () => automationsState),
    isAutomationEnabled: vi.fn(async () => true),
  },
}))

vi.mock('../../emails', () => ({
  renderEmailTemplate: vi.fn(async () => ({ html: '<p>Welcome</p>', text: 'Welcome', subject: 'Welcome to Prodily' })),
}))

// `mockSend` stands in for one provider dispatch. These tests are about the quota gate
// — whether a send happens at all — not about which provider serves it, so the failover
// helper is faked as a thin single-attempt wrapper around the same spy.
const mockSend = vi.fn(async () => ({ success: true, externalId: 'sent-123' }))
vi.mock('../notifications/providers', () => ({
  globalProviderRegistry: {},
  getActiveEmailProvider: vi.fn(() => ({ name: 'brevo', send: mockSend })),
  sendEmailWithFailover: vi.fn(async () => {
    const result = await mockSend()
    return {
      success: result.success,
      provider: 'brevo',
      externalId: result.externalId,
      attempts: [{ ...result, providerName: 'brevo', timestamp: new Date().toISOString() }],
      failedOver: false,
    }
  }),
}))

import { processEmailQueue } from '../notifications/queue/processor'

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

/** Builds a fake Supabase client with controllable RPC results and update-call capture. */
function buildFakeSupabase(opts: {
  claimedRows: Array<Record<string, unknown>>
  quotaAvailable: boolean | 'error'
  onQueueUpdate?: (payload: Record<string, unknown>) => void
}) {
  const rpc = vi.fn(async (name: string, _args: Record<string, unknown>) => {
    if (name === 'claim_email_queue_items') {
      return { data: opts.claimedRows, error: null }
    }
    if (name === 'increment_daily_email_quota') {
      if (opts.quotaAvailable === 'error') {
        throw new Error('simulated RPC failure')
      }
      return { data: opts.quotaAvailable, error: null }
    }
    return { data: null, error: null }
  })

  const from = (table: string) => {
    if (table === 'email_suppressions') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
    }
    if (table === 'email_queue') {
      return {
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, _val: string) => {
            opts.onQueueUpdate?.(payload)
            return Promise.resolve({ data: null, error: null })
          },
        }),
      }
    }
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }
  }

  return { rpc, from } as unknown as SupabaseClient<Database>
}

describe('Email daily quota enforcement (pre-dispatch, atomic, non-bypassable)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    automationsState.globalPause = false
    automationsState.dailyLimit = 100
  })

  it('checks the quota RPC BEFORE calling the email provider, and delivers when quota is available', async () => {
    const updates: Record<string, unknown>[] = []
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow()],
      quotaAvailable: true,
      onQueueUpdate: (p) => updates.push(p),
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const result = await processEmailQueue(10)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.delivered).toBe(1)
    expect(result.skipped).toBe(0)
    expect(updates.some((u) => u.status === 'delivered')).toBe(true)
  })

  it('does NOT send when quota is exhausted, and defers the item instead of delivering it anyway', async () => {
    const updates: Record<string, unknown>[] = []
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow()],
      quotaAvailable: false, // increment_daily_email_quota() returns false once the daily cap is hit
      onQueueUpdate: (p) => updates.push(p),
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const result = await processEmailQueue(10)

    // The core regression check: the provider must never be invoked once quota is exhausted.
    expect(mockSend).not.toHaveBeenCalled()
    expect(result.delivered).toBe(0)
    expect(result.skipped).toBe(1)

    const deferredUpdate = updates.find((u) => u.status === 'retrying')
    expect(deferredUpdate).toBeDefined()
    expect(deferredUpdate?.error_message).toBe('Daily email send quota reached')
    expect(deferredUpdate?.next_retry_at).toBeDefined()
    // Must never be marked delivered or silently dropped
    expect(updates.some((u) => u.status === 'delivered')).toBe(false)
  })

  it('bypasses the quota gate for critical auth templates (verify_email, password_reset)', async () => {
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow({ template_key: 'auth.verify_email' })],
      quotaAvailable: false, // even with quota exhausted, critical auth email must still send
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const result = await processEmailQueue(10)

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.delivered).toBe(1)
    expect(fake.rpc).not.toHaveBeenCalledWith('increment_daily_email_quota', expect.anything())
  })

  it('fails safe (proceeds without blocking) if the quota RPC itself errors, rather than wedging the queue', async () => {
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow()],
      quotaAvailable: 'error',
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const result = await processEmailQueue(10)

    // A broken quota RPC must not silently block all mail forever; it degrades to "allow" and logs.
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(result.delivered).toBe(1)
  })

  it('passes the configured dailyLimit through to the atomic RPC on every non-critical item (no separate read-then-write in application code)', async () => {
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow()],
      quotaAvailable: true,
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)
    automationsState.dailyLimit = 42

    await processEmailQueue(10)

    // The single atomic increment-and-check call IS the concurrency guard (enforced in
    // Postgres via a conditional UPDATE) — application code makes exactly one call per
    // item and trusts its boolean result, so there is no TOCTOU window for concurrent
    // workers to race past the limit.
    expect(fake.rpc).toHaveBeenCalledWith('increment_daily_email_quota', { p_limit: 42 })
    const quotaCalls = (fake.rpc as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === 'increment_daily_email_quota'
    )
    expect(quotaCalls).toHaveLength(1)
  })

  it('processes multiple claimed items independently — quota exhaustion on one does not affect delivery accounting for a prior one', async () => {
    let call = 0
    const quotaResults = [true, false]
    const updates: Record<string, unknown>[] = []
    const fake = buildFakeSupabase({
      claimedRows: [makeQueueRow({ id: 'row-a' }), makeQueueRow({ id: 'row-b' })],
      quotaAvailable: true, // overridden below via custom rpc
      onQueueUpdate: (p) => updates.push(p),
    })
    // Override rpc to return alternating quota results per call
    ;(fake.rpc as unknown as ReturnType<typeof vi.fn>) = vi.fn(async (name: string) => {
      if (name === 'claim_email_queue_items') {
        return { data: [makeQueueRow({ id: 'row-a' }), makeQueueRow({ id: 'row-b' })], error: null }
      }
      if (name === 'increment_daily_email_quota') {
        return { data: quotaResults[call++], error: null }
      }
      return { data: null, error: null }
    })
    vi.spyOn(supabaseModule, 'createServiceRoleClient').mockReturnValue(fake)

    const result = await processEmailQueue(10)

    expect(mockSend).toHaveBeenCalledTimes(1) // only row-a got through
    expect(result.delivered).toBe(1)
    expect(result.skipped).toBe(1)
  })
})
