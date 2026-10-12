import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'
import type { ProofState } from '@/lib/growth/proof-state'

// Admin R6 / C3: the proof summary in the admin user drawer. The proof-state loader is mocked; the
// two direct reads (latest Fellow request, latest nudge) go through a canned Supabase stand-in.

const loadProofStates = vi.fn()
// A load that throws is simulated outside vi.fn: Vitest reports an error thrown by a mock
// implementation as a test failure even when the code under test catches it.
let loadThrows = false
vi.mock('@/lib/growth/proof-state-db', () => ({
  loadProofStates: async (...args: unknown[]) => {
    if (loadThrows) throw new Error('boom')
    return loadProofStates(...args)
  },
}))
vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => {
    throw new Error('tests pass a client')
  },
}))

import { getUserProofSummary } from '@/lib/admin/user-proof-service'

const USER = 'user-1'

function state(overrides: Partial<ProofState> = {}): ProofState {
  return {
    portfolio: { isPublic: true, readyButPrivate: false, readinessPercent: 100 },
    fellowState: 'not_eligible',
    latestFellowRequestStatus: null,
    nextCapstone: null,
    certificate: { completedLessons: 10, totalLessons: 90, earned: false },
    ...overrides,
  }
}

type Response = { data: unknown; error?: unknown }

function fakeSupabase(responses: Record<string, Response>) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const client = {
    from(table: string) {
      const response = responses[table] ?? { data: null, error: { message: `unexpected table ${table}` } }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order', 'limit']) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return chain
        }
      }
      chain.maybeSingle = () => Promise.resolve({ error: null, ...response })
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, calls }
}

/** Every string anywhere in a value. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...strings(v)])
  return []
}

function expectFellowWording(summary: unknown) {
  for (const s of strings(summary)) expect(s.toLowerCase()).not.toMatch(/certificate|credential/)
}

beforeEach(() => {
  loadProofStates.mockReset()
  loadThrows = false
})

describe('getUserProofSummary', () => {
  it('reports an eligible learner with the request-Fellow next step and no request yet', async () => {
    loadProofStates.mockResolvedValue(new Map([[USER, state({ fellowState: 'eligible' })]]))
    const { client } = fakeSupabase({ fellow_requests: { data: null }, notification_events: { data: null } })

    const summary = await getUserProofSummary(USER, client)

    expect(summary).toMatchObject({
      userId: USER,
      fellowState: 'eligible',
      latestRequest: null,
      lastNudge: null,
      nextStep: { kind: 'request_fellow' },
    })
    expectFellowWording(summary)
  })

  it('reports a pending request and the last nudge', async () => {
    loadProofStates.mockResolvedValue(
      new Map([[USER, state({ fellowState: 'pending', latestFellowRequestStatus: 'pending' })]]),
    )
    const { client, calls } = fakeSupabase({
      fellow_requests: { data: { status: 'pending', requested_at: '2026-10-01T00:00:00Z', reviewed_at: null } },
      notification_events: {
        data: { event_type: 'nudge.fellow_eligible.reminder', skipped_reason: null, created_at: '2026-09-30T00:00:00Z' },
      },
    })

    const summary = await getUserProofSummary(USER, client)

    expect(summary?.fellowState).toBe('pending')
    expect(summary?.latestRequest).toEqual({ status: 'pending', requestedAt: '2026-10-01T00:00:00Z', reviewedAt: null })
    expect(summary?.lastNudge).toEqual({ key: 'nudge.fellow_eligible', round: 'reminder', heldOut: false, at: '2026-09-30T00:00:00Z' })
    // The nudge read is limited to the proof-nudge event types, newest first.
    const inCall = calls.find((c) => c.table === 'notification_events' && c.method === 'in')
    expect(inCall?.args).toEqual([
      'event_type',
      ['nudge.portfolio_ready', 'nudge.portfolio_ready.reminder', 'nudge.fellow_eligible', 'nudge.fellow_eligible.reminder'],
    ])
    expect(calls).toContainEqual({ table: 'notification_events', method: 'order', args: ['created_at', { ascending: false }] })
    expectFellowWording(summary)
  })

  it('reports a Fellow and a held-out nudge', async () => {
    loadProofStates.mockResolvedValue(
      new Map([[USER, state({ fellowState: 'approved', latestFellowRequestStatus: 'approved' })]]),
    )
    const { client } = fakeSupabase({
      fellow_requests: { data: { status: 'approved', requested_at: '2026-09-01T00:00:00Z', reviewed_at: '2026-09-02T00:00:00Z' } },
      notification_events: {
        data: { event_type: 'nudge.portfolio_ready', skipped_reason: 'nudge_holdout', created_at: '2026-08-01T00:00:00Z' },
      },
    })

    const summary = await getUserProofSummary(USER, client)

    expect(summary?.fellowState).toBe('approved')
    expect(summary?.latestRequest?.status).toBe('approved')
    expect(summary?.lastNudge).toEqual({ key: 'nudge.portfolio_ready', round: 'initial', heldOut: true, at: '2026-08-01T00:00:00Z' })
    expectFellowWording(summary)
  })

  it('rephrases the continue-lessons step without the word certificate', async () => {
    loadProofStates.mockResolvedValue(new Map([[USER, state()]]))
    const { client } = fakeSupabase({ fellow_requests: { data: null }, notification_events: { data: null } })

    const summary = await getUserProofSummary(USER, client)

    expect(summary?.nextStep).toEqual({ kind: 'continue_lessons', text: 'Continue lessons: 10 of 90 completed.', path: '/academy' })
    expect(summary?.lessons).toEqual({ completed: 10, total: 90, curriculumComplete: false })
    expectFellowWording(summary)
  })

  it('returns a plain serializable object', async () => {
    loadProofStates.mockResolvedValue(new Map([[USER, state({ fellowState: 'eligible' })]]))
    const { client } = fakeSupabase({ fellow_requests: { data: null }, notification_events: { data: null } })

    const summary = await getUserProofSummary(USER, client)

    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary)
  })

  it.each([
    ['the proof-state load fails', () => loadProofStates.mockResolvedValue(null), {}],
    ['the user is missing', () => loadProofStates.mockResolvedValue(new Map()), {}],
    [
      'the request read errors',
      () => loadProofStates.mockResolvedValue(new Map([[USER, state()]])),
      { fellow_requests: { data: null, error: { message: 'down' } } },
    ],
    [
      'the nudge read errors',
      () => loadProofStates.mockResolvedValue(new Map([[USER, state()]])),
      { notification_events: { data: null, error: { message: 'down' } } },
    ],
  ])('returns null when %s', async (_label, arrange, overrides: Record<string, Response>) => {
    arrange()
    const { client } = fakeSupabase({ fellow_requests: { data: null }, notification_events: { data: null }, ...overrides })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getUserProofSummary(USER, client)).resolves.toBeNull()
    spy.mockRestore()
  })

  it('returns null when the proof-state load throws', async () => {
    loadThrows = true
    const { client } = fakeSupabase({ fellow_requests: { data: null }, notification_events: { data: null } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getUserProofSummary(USER, client)).resolves.toBeNull()
    spy.mockRestore()
  })

  it('returns null when no client can be created', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(getUserProofSummary(USER)).resolves.toBeNull()
    spy.mockRestore()
  })
})
