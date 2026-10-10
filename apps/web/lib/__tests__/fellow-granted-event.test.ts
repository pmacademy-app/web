/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Growth R1 / Task 7 — `fellow.granted` typed, idempotent event.
 *
 * - `AdminConsoleService.toggleUserFellowStatus` dispatches `fellow.granted` only on a real
 *   false → true transition — decided atomically by the conditional grant update, so a
 *   double click or retry dispatches once — under a stable per-user id, and never lets a
 *   notification problem change the admin action's result.
 * - Fellow request approval no longer writes its own in-app row (the event covers it), except
 *   on a re-approval after a revoke: there the event's row is deduplicated against the first
 *   grant's, so the request service writes one request-scoped fallback. Rejection still writes
 *   its own message.
 * - The event is registered and routed in-app (with a portfolio deep link).
 *
 * The email side (Task 9) lives in fellow-granted-email.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { clientHolder, enqueueSpy, createInAppSpy, logAdminActionSpy } = vi.hoisted(() => ({
  clientHolder: { current: null as unknown },
  enqueueSpy: vi.fn(),
  createInAppSpy: vi.fn(),
  logAdminActionSpy: vi.fn(),
}))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => clientHolder.current }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/admin/guard', () => ({
  logAdminAction: (...args: unknown[]) => logAdminActionSpy(...args),
}))

// Isolation only: the connector tests below run the real dispatcher, and any other handler
// registered for the event must not reach the real queue. Nothing here asserts on it.
vi.mock('@/lib/notifications/queue/processor', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, enqueueNotificationItem: (...args: unknown[]) => enqueueSpy(...args) }
})

vi.mock('@/lib/notifications/in-app/service', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createInAppNotification: (...args: unknown[]) => createInAppSpy(...args) }
})

import { AdminConsoleService } from '@/lib/admin/service'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'
import { globalNotificationDispatcher } from '@/lib/notifications/dispatcher'
import { initializeNotificationConnectors } from '@/lib/notifications/events/connectors'
import { EVENT_DEFINITIONS, validateEventPayload } from '@/lib/notifications/events'
import { buildInAppContentFromEvent } from '@/lib/notifications/in-app/service'

type UserRow = Record<string, unknown> | null

/**
 * Stateful users-table mock.
 *
 * - `select → eq → maybeSingle` returns a snapshot of the stored row, taken when the read is
 *   issued (so two concurrent callers both see the pre-grant state).
 * - `update → eq…` is awaitable directly (revoke) and also supports the conditional grant
 *   `update → eq('id') → eq('is_fellow', false) → select('id')`. Like Postgres, the filters
 *   are evaluated against the stored row at write time: only an update whose filters still
 *   match changes the row and returns it; a non-matching one succeeds with zero rows.
 */
function usersClient(row: UserRow, updateError: unknown = null) {
  const state: Record<string, unknown> | null = row ? { ...row } : null
  const updates: Array<Record<string, unknown>> = []
  const updateFilters: Array<Array<[string, unknown]>> = []

  const applyUpdate = (payload: Record<string, unknown>, filters: Array<[string, unknown]>) => {
    if (updateError) return { data: null, error: updateError }
    if (!state) return { data: [], error: null }
    // `users.is_fellow` is NOT NULL DEFAULT false, so a fixture that omits it is a non-Fellow.
    const stored = (col: string) => (col === 'is_fellow' ? Boolean(state[col]) : state[col])
    if (!filters.every(([col, val]) => stored(col) === val)) return { data: [], error: null }
    Object.assign(state, payload)
    return { data: [{ id: state.id }], error: null }
  }

  const client = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => {
            const snapshot = state ? { ...state } : null
            return Promise.resolve({ data: snapshot, error: null })
          }),
        })),
      })),
      update: vi.fn((payload: Record<string, unknown>) => {
        updates.push(payload)
        const filters: Array<[string, unknown]> = []
        updateFilters.push(filters)
        const chain = {
          eq: vi.fn((col: string, val: unknown) => {
            filters.push([col, val])
            return chain
          }),
          select: vi.fn(async () => applyUpdate(payload, filters)),
          then: (resolve: (value: { error: unknown }) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ error: applyUpdate(payload, filters).error }).then(resolve, reject),
        }
        return chain
      }),
    })),
  }
  return { client, updates, updateFilters, state }
}

const publicLearner = {
  id: 'user-1',
  username: 'jordanpm',
  is_portfolio_public: true,
  is_fellow: false,
  email: 'jordan@example.com',
  name: 'Jordan PM',
}

function envelope(event: string, payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: `${event}-evt`,
    event,
    userId: 'user-1',
    userEmail: 'jordan@example.com',
    userName: 'Jordan PM',
    userTimezone: 'UTC',
    priority: 'high',
    category: 'achievements',
    occurredAt: '2026-10-09T00:00:00.000Z',
    payload,
    ...overrides,
  } as any
}

let dispatchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  enqueueSpy.mockReset().mockResolvedValue({ success: true, queueId: 'q-1' })
  createInAppSpy.mockReset().mockResolvedValue({ success: true, id: 'n-1' })
  logAdminActionSpy.mockReset().mockResolvedValue(undefined)
  dispatchSpy = vi
    .spyOn(globalNotificationDispatcher, 'dispatch')
    .mockResolvedValue({ dispatched: true, handlerCount: 2, errors: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** One event per grant: `fellow-granted-<userId>-<grant epoch ms>` (Growth R5 P1). */
const GRANT_ID = /^fellow-granted-user-1-\d+$/

describe('toggleUserFellowStatus → fellow.granted', () => {
  it('dispatches fellow.granted once on a false → true grant, with real recipient details', async () => {
    const { client, updates } = usersClient(publicLearner)
    clientHolder.current = client

    const ok = await AdminConsoleService.toggleUserFellowStatus('user-1', true)

    expect(ok).toBe(true)
    expect(updates).toEqual([{ is_fellow: true }])
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    const event = dispatchSpy.mock.calls[0][0] as any
    expect(event.id).toMatch(GRANT_ID)
    expect(event.event).toBe('fellow.granted')
    expect(event.userId).toBe('user-1')
    expect(event.userEmail).toBe('jordan@example.com')
    expect(event.userName).toBe('Jordan PM')
    expect(event.category).toBe('achievements')
    expect(event.priority).toBe('high')
    expect(event.payload.username).toBe('jordanpm')
    expect(event.payload.isPortfolioPublic).toBe(true)
    expect(event.payload.portfolioUrl).toMatch(/^https?:\/\/[^/]+\/p\/jordanpm$/)
    expect(typeof event.payload.grantedAt).toBe('string')
    expect(event.occurredAt).toBe(event.payload.grantedAt)
    expect(validateEventPayload('fellow.granted', event.payload)).toBe(true)
  })

  it('grants with an update conditional on the previous state (is_fellow = false)', async () => {
    const { client, updateFilters, state } = usersClient(publicLearner)
    clientHolder.current = client

    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)

    expect(updateFilters).toEqual([
      [
        ['id', 'user-1'],
        ['is_fellow', false],
      ],
    ])
    expect(state?.is_fellow).toBe(true)
  })

  it('two concurrent grants (double click) dispatch fellow.granted exactly once', async () => {
    const { client, updates, state } = usersClient(publicLearner)
    clientHolder.current = client

    // Both calls issue their read before either write lands, so both see `is_fellow: false`.
    const results = await Promise.all([
      AdminConsoleService.toggleUserFellowStatus('user-1', true),
      AdminConsoleService.toggleUserFellowStatus('user-1', true),
    ])

    expect(results).toEqual([true, true])
    expect(updates).toEqual([{ is_fellow: true }, { is_fellow: true }])
    expect(state?.is_fellow).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect((dispatchSpy.mock.calls[0][0] as any).id).toMatch(GRANT_ID)
  })

  it('a retried grant succeeds without dispatching again', async () => {
    clientHolder.current = usersClient(publicLearner).client

    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)

    expect(dispatchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch when the learner is already a Fellow (true → true)', async () => {
    const { client, state } = usersClient({ ...publicLearner, is_fellow: true })
    clientHolder.current = client
    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
    expect(state?.is_fellow).toBe(true)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('does not dispatch on revoke', async () => {
    const { client, updates, updateFilters, state } = usersClient({ ...publicLearner, is_fellow: true })
    clientHolder.current = client
    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', false)).toBe(true)
    expect(updates).toEqual([{ is_fellow: false }])
    expect(updateFilters).toEqual([[['id', 'user-1']]])
    expect(state?.is_fellow).toBe(false)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('still refuses to grant on a private portfolio, and dispatches nothing', async () => {
    const { client, updates } = usersClient({ ...publicLearner, is_portfolio_public: false })
    clientHolder.current = client
    await expect(AdminConsoleService.toggleUserFellowStatus('user-1', true)).rejects.toThrow(
      /Cannot verify a private portfolio/
    )
    expect(updates).toEqual([])
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('does not dispatch when the update fails', async () => {
    clientHolder.current = usersClient(publicLearner, { message: 'boom' }).client
    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(false)
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('a throwing dispatcher never changes the admin result', async () => {
    clientHolder.current = usersClient(publicLearner).client
    dispatchSpy.mockRejectedValueOnce(new Error('dispatcher down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
  })

  it('tolerates a missing email/name (falls back without failing)', async () => {
    clientHolder.current = usersClient({ id: 'user-1', username: 'jordanpm', is_portfolio_public: true }).client
    expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
    const event = dispatchSpy.mock.calls[0][0] as any
    expect(event.userEmail).toBe('')
    expect(event.userName).toBe('jordanpm')
  })
})

describe('Fellow request review notifications', () => {
  const REQUESTED_AT = '2026-10-01T00:00:00Z'

  /**
   * Table-aware client for `reviewRequest`, which runs the real `toggleUserFellowStatus`.
   *
   * - `fellow_requests`: one pending request submitted at `REQUESTED_AT`.
   * - `users`: the stateful `usersClient` above, so the grant's conditional update is real.
   * - `in_app_notifications`: the learner's `fellow-granted-<userId>` row, if any. `grantRowAt`
   *   is its `created_at` (null = no row); the filters of each lookup are recorded.
   */
  function reviewClient(
    opts: {
      learner?: UserRow
      grantRowAt?: string | null
      usersThrow?: boolean
      grantLookupThrows?: boolean
      grantLookupError?: unknown
    } = {}
  ) {
    const pending = {
      id: 'req-1',
      user_id: 'user-1',
      status: 'pending',
      requested_at: REQUESTED_AT,
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
    }
    const users = usersClient(opts.learner === undefined ? publicLearner : opts.learner)
    const grantLookups: Array<Array<[string, unknown]>> = []
    const requestUpdates: Array<Record<string, unknown>> = []

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          if (opts.usersThrow) throw new Error('users down')
          return (users.client.from as unknown as (t: string) => unknown)(table)
        }
        if (table === 'in_app_notifications') {
          if (opts.grantLookupThrows) throw new Error('in_app_notifications down')
          const filters: Array<[string, unknown]> = []
          grantLookups.push(filters)
          const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn((col: string, val: unknown) => {
              filters.push([col, val])
              return chain
            }),
            maybeSingle: vi.fn(async () =>
              opts.grantLookupError
                ? { data: null, error: opts.grantLookupError }
                : { data: opts.grantRowAt ? { id: 'n-grant', created_at: opts.grantRowAt } : null, error: null }
            ),
          }
          return chain
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: pending, error: null })) })),
          })),
          update: vi.fn((payload: Record<string, unknown>) => {
            requestUpdates.push(payload)
            return { eq: vi.fn(async () => ({ error: null })) }
          }),
        }
      }),
    }
    return { client, users, grantLookups, requestUpdates }
  }

  const approve = () => FellowRequestAdminService.reviewRequest('admin-1', 'admin@prodily.app', 'req-1', 'approved')

  it('approval is announced by the fellow.granted event alone, with no extra in-app row', async () => {
    const { client, users, requestUpdates } = reviewClient()
    clientHolder.current = client

    expect(await approve()).toEqual({ success: true })

    expect(users.state?.is_fellow).toBe(true)
    expect(requestUpdates[0].status).toBe('approved')
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect((dispatchSpy.mock.calls[0][0] as any).id).toMatch(GRANT_ID)
    expect(createInAppSpy).not.toHaveBeenCalled()
  })

  // Growth R5 P1: a re-approval after a revoke is a new grant, announced in full again.
  it('a re-approval after a revoke is announced again, under a new event id', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const users = usersClient(publicLearner)
      clientHolder.current = users.client
      vi.setSystemTime(new Date('2026-09-01T00:00:00Z'))
      expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
      expect(await AdminConsoleService.toggleUserFellowStatus('user-1', false)).toBe(true)
      vi.setSystemTime(new Date('2026-10-02T00:00:00Z'))
      expect(await AdminConsoleService.toggleUserFellowStatus('user-1', true)).toBe(true)
    } finally {
      vi.useRealTimers()
    }

    const ids = dispatchSpy.mock.calls.map((call: unknown[]) => (call[0] as any).id)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toMatch(GRANT_ID)
    expect(ids[1]).toMatch(GRANT_ID)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('a double-clicked approval announces the grant once', async () => {
    clientHolder.current = reviewClient().client

    const results = await Promise.all([approve(), approve()])

    expect(results).toEqual([{ success: true }, { success: true }])
    expect(dispatchSpy).toHaveBeenCalledTimes(1)
    expect(createInAppSpy).not.toHaveBeenCalled()
  })

  it('announces nothing when the learner was already a Fellow at approval time', async () => {
    clientHolder.current = reviewClient({ learner: { ...publicLearner, is_fellow: true } }).client

    expect(await approve()).toEqual({ success: true })

    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(createInAppSpy).not.toHaveBeenCalled()
  })

  it('a failed grant announces nothing and leaves the request pending', async () => {
    const { client, requestUpdates } = reviewClient()
    clientHolder.current = client
    vi.spyOn(AdminConsoleService, 'toggleUserFellowStatus').mockResolvedValueOnce(false)

    expect(await approve()).toEqual({ success: false, error: 'Failed to grant Fellow status.' })

    expect(requestUpdates).toEqual([])
    expect(createInAppSpy).not.toHaveBeenCalled()
  })

  it('rejection still sends the rejection in-app message', async () => {
    const { client, users, grantLookups } = reviewClient()
    clientHolder.current = client

    const result = await FellowRequestAdminService.reviewRequest(
      'admin-1',
      'admin@prodily.app',
      'req-1',
      'rejected',
      'Add a profile photo first'
    )

    expect(result).toEqual({ success: true })
    expect(users.state?.is_fellow).toBe(false)
    expect(grantLookups).toEqual([])
    expect(dispatchSpy).not.toHaveBeenCalled()
    expect(createInAppSpy).toHaveBeenCalledTimes(1)
    const params = createInAppSpy.mock.calls[0][0] as any
    expect(params.userId).toBe('user-1')
    expect(params.title).toBe('Fellow request update')
    expect(params.body).toContain('Add a profile photo first')
    expect(params.idempotencyKey).toBeUndefined()
  })
})

describe('fellow.granted event definition', () => {
  it('is a registered achievements event with a payload guard', () => {
    const def = EVENT_DEFINITIONS['fellow.granted']
    expect(def).toBeDefined()
    expect(def.category).toBe('achievements')
    expect(def.defaultPriority).toBe('high')

    const grantedAt = '2026-10-09T00:00:00.000Z'
    expect(validateEventPayload('fellow.granted', { username: 'jordanpm', isPortfolioPublic: true, portfolioUrl: 'x', grantedAt })).toBe(true)
    expect(validateEventPayload('fellow.granted', { username: null, isPortfolioPublic: false, portfolioUrl: null, grantedAt })).toBe(true)
    expect(validateEventPayload('fellow.granted', { username: 'jordanpm' })).toBe(false)
    expect(validateEventPayload('fellow.granted', { username: 42, grantedAt })).toBe(false)
    expect(validateEventPayload('fellow.granted', null)).toBe(false)
  })
})

describe('fellow.granted in-app content', () => {
  it('deep-links to the public portfolio when it is public', () => {
    const content = buildInAppContentFromEvent(envelope('fellow.granted', { username: 'jordanpm', isPortfolioPublic: true }))
    expect(content.title).toBe('You are now a PM Fellow!')
    expect(content.body).toBe('Congratulations! Your PM Fellow badge is now live on your public portfolio.')
    expect(content.actionUrl).toBe('/p/jordanpm')
  })

  it('falls back to portfolio settings without a username or public portfolio', () => {
    expect(buildInAppContentFromEvent(envelope('fellow.granted', { username: null, isPortfolioPublic: true })).actionUrl).toBe(
      '/settings?tab=portfolio'
    )
    expect(
      buildInAppContentFromEvent(envelope('fellow.granted', { username: 'jordanpm', isPortfolioPublic: false })).actionUrl
    ).toBe('/settings?tab=portfolio')
  })
})

describe('fellow.granted in-app connector', () => {
  const payload = {
    username: 'jordanpm',
    isPortfolioPublic: true,
    portfolioUrl: 'https://prodily.example/p/jordanpm',
    grantedAt: '2026-10-09T00:00:00.000Z',
  }

  it('registers an in-app handler', () => {
    initializeNotificationConnectors(true)
    const ids = globalNotificationDispatcher.getRegisteredHandlerIds('fellow.granted')
    expect(ids).toContain('connector.in_app.fellow.granted')
  })

  it('writes the in-app row under the per-grant event id', async () => {
    dispatchSpy.mockRestore()
    initializeNotificationConnectors(true)

    const result = await globalNotificationDispatcher.dispatch(
      envelope('fellow.granted', payload, { id: 'fellow-granted-user-1-1791590400000' })
    )
    expect(result.errors).toEqual([])

    expect(createInAppSpy).toHaveBeenCalledTimes(1)
    const inApp = createInAppSpy.mock.calls[0][0] as any
    expect(inApp.idempotencyKey).toBe('fellow-granted-user-1-1791590400000')
    expect(inApp.category).toBe('achievements')
    expect(inApp.actionUrl).toBe('/p/jordanpm')
  })
})
