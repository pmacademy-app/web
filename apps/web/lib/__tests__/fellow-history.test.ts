/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Admin R6 C4: capstone rows carry the public-page link only when that page renders, and
 * Fellow queue items carry an ordered history built from requests, admin re-grants/revokes
 * and the fellow-granted celebration — read in batches, never failing the queue.
 */

interface RecordedQuery {
  table: string
  ops: Array<[string, unknown[]]>
}

type QueryResult = { data: unknown; error: unknown; count?: number | null }

let queries: RecordedQuery[] = []
let resolver: (q: RecordedQuery) => QueryResult = () => ({ data: [], error: null, count: 0 })

const CHAIN_METHODS = ['select', 'eq', 'neq', 'is', 'not', 'or', 'in', 'order', 'range', 'limit', 'like', 'ilike']

function createChain(table: string) {
  const record: RecordedQuery = { table, ops: [] }
  queries.push(record)
  const chain: any = {}
  for (const method of CHAIN_METHODS) {
    chain[method] = (...args: unknown[]) => {
      record.ops.push([method, args])
      return chain
    }
  }
  chain.maybeSingle = () => {
    record.ops.push(['maybeSingle', []])
    return Promise.resolve(resolver(record))
  }
  chain.then = (resolve: any, reject: any) => Promise.resolve(resolver(record)).then(resolve, reject)
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: (table: string) => createChain(table) })),
}))
vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: any) => fn),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('@/lib/admin/guard', () => ({ logAdminAction: vi.fn(async () => {}) }))
vi.mock('@/lib/notifications/in-app/service', () => ({ createInAppNotification: vi.fn() }))
vi.mock('@/lib/admin/service', () => ({ AdminConsoleService: { toggleUserFellowStatus: vi.fn() } }))

import { ModerationService, capstonePublicLink } from '@/lib/admin/moderation-service'
import {
  FellowRequestAdminService,
  sortFellowHistory,
  type FellowHistoryEvent,
} from '@/lib/admin/fellow-request-service'

const ops = (q: RecordedQuery, name: string) => q.ops.filter(([m]) => m === name).map(([, args]) => args)
const isPageQuery = (q: RecordedQuery) => ops(q, 'range').length > 0

const UUID = '11111111-2222-4333-8444-555555555555'

beforeEach(() => {
  queries = []
  resolver = () => ({ data: [], error: null, count: 0 })
})

describe('capstonePublicLink', () => {
  const reviewedPublic = { module_slug: 'strategy', status: 'reviewed', is_public: true }
  const owner = { username: 'ada lovelace', is_portfolio_public: true }

  it('links only when reviewed, public, with a username and a public portfolio', () => {
    expect(capstonePublicLink(reviewedPublic, owner)).toEqual({
      username: 'ada lovelace',
      portfolioPublic: true,
      publicPath: '/p/ada%20lovelace/capstones/strategy',
    })
  })

  it.each([
    ['not reviewed', { ...reviewedPublic, status: 'submitted' }, owner],
    ['private capstone', { ...reviewedPublic, is_public: false }, owner],
    ['no username', reviewedPublic, { username: null, is_portfolio_public: true }],
    ['private portfolio', reviewedPublic, { username: 'ada', is_portfolio_public: false }],
    ['unknown owner', reviewedPublic, undefined],
  ])('is null when %s', (_label, s, user) => {
    expect(capstonePublicLink(s, user).publicPath).toBeNull()
  })
})

describe('capstone rows carry username, portfolioPublic and publicPath', () => {
  const submission = {
    id: UUID,
    user_id: 'u1',
    module_slug: 'strategy',
    content: 'one two',
    status: 'reviewed',
    is_public: true,
    submitted_at: '2026-01-01',
    reviewed_at: '2026-01-02',
  }

  it('getCapstoneById reads is_portfolio_public and sets the link', async () => {
    resolver = (q) =>
      q.table === 'users'
        ? { data: [{ id: 'u1', name: 'Ada', username: 'ada', is_portfolio_public: true }], error: null }
        : { data: submission, error: null }
    const { capstone } = await ModerationService.getCapstoneById(UUID)
    const usersQuery = queries.find((q) => q.table === 'users')!
    expect(String(ops(usersQuery, 'select')[0][0])).toContain('is_portfolio_public')
    expect(capstone).toMatchObject({
      username: 'ada',
      portfolioPublic: true,
      publicPath: '/p/ada/capstones/strategy',
    })
  })

  it('getCapstonesPage rows get the fields too (null link for a private portfolio)', async () => {
    resolver = (q) => {
      if (q.table === 'users') return { data: [{ id: 'u1', username: 'ada', is_portfolio_public: false }], error: null }
      const head = (ops(q, 'select')[0]?.[1] as any)?.head === true
      if (head) return { data: null, error: null, count: ops(q, 'or').length > 0 ? 1 : 0 }
      return { data: [submission], error: null }
    }
    const result = await ModerationService.getCapstonesPage()
    expect(result.items[0]).toMatchObject({ username: 'ada', portfolioPublic: false, publicPath: null })
  })
})

describe('sortFellowHistory', () => {
  it('orders oldest first with a fixed tie order', () => {
    const events: FellowHistoryEvent[] = [
      { kind: 'celebration', at: '2026-03-01T00:00:00Z', seen: false },
      { kind: 'admin_grant', at: '2026-03-01T00:00:00Z', adminEmail: 'a@x.io' },
      { kind: 'request', at: '2026-01-01T00:00:00Z', requestId: 'r1', status: 'rejected', reviewedAt: null, rejectionReason: null },
      { kind: 'admin_revoke', at: '2026-02-01T00:00:00Z', adminEmail: null },
    ]
    expect(sortFellowHistory(events).map((e) => e.kind)).toEqual([
      'request',
      'admin_revoke',
      'admin_grant',
      'celebration',
    ])
  })
})

describe('Fellow queue history', () => {
  const pageRows = [
    { id: 'r2', user_id: 'u1', status: 'pending', requested_at: '2026-04-01T00:00:00Z', reviewed_by: null, reviewed_at: null, rejection_reason: null },
    { id: 'r9', user_id: 'u2', status: 'pending', requested_at: '2026-04-02T00:00:00Z', reviewed_by: null, reviewed_at: null, rejection_reason: null },
  ]

  function seed(overrides: Partial<Record<string, QueryResult>> = {}) {
    resolver = (q) => {
      if (overrides[q.table]) return overrides[q.table]!
      if (q.table === 'fellow_requests' && isPageQuery(q)) return { data: pageRows, error: null, count: 2 }
      if (q.table === 'fellow_requests') {
        return {
          data: [
            { id: 'r1', user_id: 'u1', status: 'rejected', requested_at: '2026-01-01T00:00:00Z', reviewed_at: '2026-01-03T00:00:00Z', rejection_reason: 'Too thin' },
            ...pageRows,
          ],
          error: null,
        }
      }
      if (q.table === 'admin_audit_logs') {
        return {
          data: [
            { target_id: 'u1', action: 'grant_fellow_status', admin_email: 'admin@x.io', created_at: '2026-02-01T00:00:00Z' },
            { target_id: 'u1', action: 'revoke_fellow_status', admin_email: 'admin@x.io', created_at: '2026-03-01T00:00:00Z' },
          ],
          error: null,
        }
      }
      if (q.table === 'in_app_notifications') {
        return {
          data: [{ user_id: 'u1', idempotency_key: 'fellow-granted-u1-1', is_read: true, created_at: '2026-02-01T00:00:05Z' }],
          error: null,
        }
      }
      if (q.table === 'users') return { data: [{ id: 'u1', username: 'ada' }, { id: 'u2', username: 'bo' }], error: null }
      return { data: [], error: null }
    }
  }

  it('attaches an ordered history from all three sources', async () => {
    seed()
    const result = await FellowRequestAdminService.getQueuePage({ status: 'pending' })
    expect(result.failed).toBe(false)
    const u1 = result.items.find((i) => i.userId === 'u1')!
    expect(u1.history.map((e) => [e.kind, e.at])).toEqual([
      ['request', '2026-01-01T00:00:00Z'],
      ['admin_grant', '2026-02-01T00:00:00Z'],
      ['celebration', '2026-02-01T00:00:05Z'],
      ['admin_revoke', '2026-03-01T00:00:00Z'],
      ['request', '2026-04-01T00:00:00Z'],
    ])
    expect(u1.history[0]).toMatchObject({ requestId: 'r1', status: 'rejected', rejectionReason: 'Too thin' })
    expect(u1.history[2]).toMatchObject({ seen: true })
    const u2 = result.items.find((i) => i.userId === 'u2')!
    expect(u2.history).toEqual([
      expect.objectContaining({ kind: 'request', requestId: 'r9', status: 'pending' }),
    ])
  })

  it('reads each source once, batched by the page users', async () => {
    seed()
    await FellowRequestAdminService.getQueuePage()

    const historyRequests = queries.filter((q) => q.table === 'fellow_requests' && !isPageQuery(q))
    const audit = queries.filter((q) => q.table === 'admin_audit_logs')
    const celebrations = queries.filter((q) => q.table === 'in_app_notifications')
    expect([historyRequests.length, audit.length, celebrations.length]).toEqual([1, 1, 1])

    expect(ops(historyRequests[0], 'in')).toEqual([['user_id', ['u1', 'u2']]])
    expect(ops(audit[0], 'in')).toEqual([
      ['action', ['grant_fellow_status', 'revoke_fellow_status']],
      ['target_id', ['u1', 'u2']],
    ])
    expect(ops(audit[0], 'eq')).toEqual([['target_resource', 'user']])
    expect(ops(celebrations[0], 'in')).toEqual([['user_id', ['u1', 'u2']]])
    expect(ops(celebrations[0], 'like')).toEqual([['idempotency_key', 'fellow-granted-%']])
  })

  it('chunks the history reads for a large queue', async () => {
    const many = Array.from({ length: 150 }, (_, n) => ({ ...pageRows[0], id: `r${n}`, user_id: `user-${n}` }))
    resolver = (q) =>
      q.table === 'fellow_requests' && isPageQuery(q)
        ? { data: many, error: null, count: 150 }
        : { data: [], error: null }
    const { items } = await FellowRequestAdminService.getQueue('all')
    expect(items).toHaveLength(150)
    const audit = queries.filter((q) => q.table === 'admin_audit_logs')
    expect(audit).toHaveLength(2)
    expect((ops(audit[0], 'in')[1][1] as string[]).length).toBe(100)
    expect((ops(audit[1], 'in')[1][1] as string[]).length).toBe(50)
  })

  it('a history read failure leaves the queue intact with empty histories', async () => {
    seed({ admin_audit_logs: { data: null, error: { message: 'boom' } } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await FellowRequestAdminService.getQueuePage()
    warn.mockRestore()
    expect(result.failed).toBe(false)
    expect(result.items).toHaveLength(2)
    for (const item of result.items) expect(item.history).toEqual([])
  })

  it('never calls Fellow a certificate or credential', async () => {
    seed()
    const result = await FellowRequestAdminService.getQueuePage()
    expect(JSON.stringify(result)).not.toMatch(/certificate|credential/i)
  })
})
