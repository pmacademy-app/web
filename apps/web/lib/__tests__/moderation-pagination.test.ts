/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Admin R6 B7: the moderation lists page on the server. These tests pin the query each
 * paged variant builds (range, exact count, the filters pushed into the query) and that
 * the filter semantics match what the client views used to do in JS.
 */

interface RecordedQuery {
  table: string
  ops: Array<[string, unknown[]]>
}

type QueryResult = { data: unknown; error: unknown; count?: number | null }

let queries: RecordedQuery[] = []
let resolver: (q: RecordedQuery) => QueryResult = () => ({ data: [], error: null, count: 0 })

const CHAIN_METHODS = ['select', 'eq', 'neq', 'is', 'not', 'or', 'in', 'order', 'range', 'limit', 'ilike']

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

import {
  ModerationService,
  buildIlikeOrFilter,
  escapeIlikeTerm,
  normalizeModerationPaging,
} from '@/lib/admin/moderation-service'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'

const ops = (q: RecordedQuery, name: string) => q.ops.filter(([m]) => m === name).map(([, args]) => args)
const isHead = (q: RecordedQuery) => (ops(q, 'select')[0]?.[1] as any)?.head === true
const dataQueries = (table: string) => queries.filter((q) => q.table === table && !isHead(q))

const UUID = '11111111-2222-4333-8444-555555555555'

beforeEach(() => {
  queries = []
  resolver = () => ({ data: [], error: null, count: 0 })
})

describe('paging helpers', () => {
  it('defaults to page 1 of 25 and clamps bad input', () => {
    expect(normalizeModerationPaging()).toEqual({ page: 1, pageSize: 25, from: 0, to: 24 })
    expect(normalizeModerationPaging('3')).toEqual({ page: 3, pageSize: 25, from: 50, to: 74 })
    expect(normalizeModerationPaging('abc', 'x')).toEqual({ page: 1, pageSize: 25, from: 0, to: 24 })
    expect(normalizeModerationPaging(-4, 10_000).pageSize).toBe(100)
    expect(normalizeModerationPaging(-4).page).toBe(1)
    // The offset cap bounds how deep a caller can page.
    expect(normalizeModerationPaging(1_000_000).from).toBeLessThanOrEqual(10_000)
  })

  it('escapes LIKE wildcards and quotes the or-filter value', () => {
    expect(escapeIlikeTerm('50%_off\\')).toBe('50\\%\\_off\\\\')
    // `%` -> `\%` for LIKE, then `\` -> `\\` inside the PostgREST double-quoted value.
    expect(buildIlikeOrFilter(['name', 'bio'], ' a%b_c ')).toBe(
      'name.ilike."%a\\\\%b\\\\_c%",bio.ilike."%a\\\\%b\\\\_c%"'
    )
    // Commas, parentheses and quotes cannot break out of the filter.
    expect(buildIlikeOrFilter(['name'], 'x,y)"z')).toBe('name.ilike."%x,y)\\"z%"')
  })
})

describe('FeedbackAdminService.getModerationQueuePage (testimonials)', () => {
  it('reads page 1 with range(0,24) and an exact count, default status all', async () => {
    resolver = (q) =>
      q.table === 'testimonials'
        ? {
            data: [
              { id: 't1', user_id: 'u1', source_event: 'general', content: 'Great', status: 'pending', is_published: false, reviewed_by: null, reviewed_at: null, created_at: '2026-01-01' },
            ],
            error: null,
            count: 31,
          }
        : { data: [{ id: 'u1', name: 'Ada', username: 'ada', email: 'ada@x.io' }], error: null }

    const result = await FeedbackAdminService.getModerationQueuePage()
    const [q] = dataQueries('testimonials')
    expect(ops(q, 'select')[0]).toEqual(['*', { count: 'exact' }])
    expect(ops(q, 'range')[0]).toEqual([0, 24])
    expect(ops(q, 'eq')).toEqual([])
    expect(result).toMatchObject({ total: 31, page: 1, pageSize: 25, failed: false })
    expect(result.items[0].authorName).toBe('Ada')
    // One batched author lookup.
    expect(queries.filter((x) => x.table === 'users')).toHaveLength(1)
  })

  it('pushes a known status into the query and ignores an unknown one', async () => {
    await FeedbackAdminService.getModerationQueuePage({ status: 'approved', page: 2 })
    let q = dataQueries('testimonials')[0]
    expect(ops(q, 'eq')).toEqual([['status', 'approved']])
    expect(ops(q, 'range')[0]).toEqual([25, 49])

    queries = []
    await FeedbackAdminService.getModerationQueuePage({ status: 'bogus' })
    q = dataQueries('testimonials')[0]
    expect(ops(q, 'eq')).toEqual([])
  })

  it('returns an empty page with the real total when the page is past the end', async () => {
    resolver = (q) => {
      const range = ops(q, 'range')[0] as number[]
      if (range[0] > 0) return { data: null, error: { code: 'PGRST103' }, count: null }
      return { data: [], error: null, count: 7 }
    }
    const result = await FeedbackAdminService.getModerationQueuePage({ page: 5 })
    expect(result).toMatchObject({ items: [], total: 7, page: 5, failed: false })
  })

  it('degrades to failed on a database error', async () => {
    resolver = () => ({ data: null, error: { code: '500', message: 'down' }, count: null })
    const result = await FeedbackAdminService.getModerationQueuePage()
    expect(result).toMatchObject({ items: [], total: 0, failed: true })
  })
})

describe('FeedbackAdminService.getPrivateFeedbackPage', () => {
  it('pages user_feedback with an exact count and optional status', async () => {
    resolver = (q) =>
      q.table === 'user_feedback'
        ? {
            data: [{ id: 'f1', user_id: null, category: 'bug', source_event: 'x', content: 'c', rating: null, status: 'new', created_at: '2026-01-01' }],
            error: null,
            count: 140,
          }
        : { data: [], error: null }
    const result = await FeedbackAdminService.getPrivateFeedbackPage({ status: 'resolved' })
    const [q] = dataQueries('user_feedback')
    expect((ops(q, 'select')[0] as any)[1]).toEqual({ count: 'exact' })
    expect(ops(q, 'range')[0]).toEqual([0, 24])
    expect(ops(q, 'eq')).toEqual([['status', 'resolved']])
    expect(ops(q, 'limit')).toEqual([])
    expect(result.total).toBe(140)
    expect(result.items[0].authorName).toBe('Anonymous Learner')
    // No authors to look up -> no users query.
    expect(queries.filter((x) => x.table === 'users')).toHaveLength(0)
  })
})

describe('FellowRequestAdminService.getQueuePage', () => {
  it("defaults to the view's 'pending' tab and pages with an exact count", async () => {
    resolver = (q) =>
      q.table === 'fellow_requests'
        ? {
            data: [{ id: 'r1', user_id: 'u1', status: 'pending', requested_at: '2026-01-01', reviewed_by: null, reviewed_at: null, rejection_reason: null }],
            error: null,
            count: 3,
          }
        : { data: [], error: null }
    const result = await FellowRequestAdminService.getQueuePage()
    const [q] = dataQueries('fellow_requests')
    expect(ops(q, 'eq')).toEqual([['status', 'pending']])
    expect(ops(q, 'range')[0]).toEqual([0, 24])
    expect((ops(q, 'select')[0] as any)[1]).toEqual({ count: 'exact' })
    expect(result).toMatchObject({ total: 3, failed: false })
    expect(result.items[0].userName).toBe('Learner')
    // Users and capstones are each one batched lookup.
    expect(queries.filter((x) => x.table === 'users')).toHaveLength(1)
    expect(queries.filter((x) => x.table === 'capstone_submissions')).toHaveLength(1)
  })

  it("'all' drops the status filter", async () => {
    await FellowRequestAdminService.getQueuePage({ status: 'all' })
    expect(ops(dataQueries('fellow_requests')[0], 'eq')).toEqual([])
  })
})

describe('ModerationService.getPortfoliosPage', () => {
  it("defaults to the 'pending' tab (not a Fellow) and returns KPI counts", async () => {
    resolver = (q) => {
      if (q.table === 'users' && isHead(q)) {
        const fellowOnly = ops(q, 'eq').some(([col]) => col === 'is_fellow')
        return { data: null, error: null, count: fellowOnly ? 4 : 10 }
      }
      if (q.table === 'users') {
        return { data: [{ id: 'u1', name: null, username: 'ada', email: 'ada@x.io', is_fellow: false, created_at: '2026-01-01' }], error: null, count: 6 }
      }
      return { data: [{ user_id: 'u1' }, { user_id: 'u1' }], error: null }
    }
    const result = await ModerationService.getPortfoliosPage()
    const [q] = dataQueries('users')
    expect(ops(q, 'eq')).toEqual([
      ['is_portfolio_public', true],
      ['is_fellow', false],
    ])
    expect(ops(q, 'or')).toEqual([])
    expect(ops(q, 'range')[0]).toEqual([0, 24])
    expect((ops(q, 'select')[0] as any)[1]).toEqual({ count: 'exact' })
    expect(result.total).toBe(6)
    expect(result.counts).toEqual({ all: 10, verified: 4, pending: 6 })
    expect(result.items[0]).toMatchObject({ learnerName: 'ada', capstoneCount: 2, isFellow: false })
  })

  it('searches name, username, email and bio with an escaped term', async () => {
    await ModerationService.getPortfoliosPage({ status: 'verified', q: '  100%_ ' })
    const [q] = dataQueries('users')
    expect(ops(q, 'eq')).toContainEqual(['is_fellow', true])
    const [filter] = ops(q, 'or')[0] as string[]
    expect(filter).toBe(
      ['name', 'username', 'email', 'bio'].map((c) => `${c}.ilike."%100\\\\%\\\\_%"`).join(',')
    )
  })

  it("'all' applies no Fellow filter", async () => {
    await ModerationService.getPortfoliosPage({ status: 'all' })
    const [q] = dataQueries('users')
    expect(ops(q, 'eq')).toEqual([['is_portfolio_public', true]])
  })
})

describe('ModerationService.getCapstonesPage', () => {
  const submission = (id: string, status = 'submitted', reviewedAt: string | null = null) => ({
    id,
    user_id: 'u1',
    module_slug: 'unknown-module',
    content: 'one two three',
    status,
    is_public: false,
    submitted_at: '2026-01-01',
    reviewed_at: reviewedAt,
  })

  const isAwaitingQuery = (q: RecordedQuery) => ops(q, 'is').some(([col, v]) => col === 'reviewed_at' && v === null)

  function capstoneResolver(awaitingTotal: number, restTotal: number) {
    return (q: RecordedQuery): QueryResult => {
      if (q.table === 'users') return { data: [{ id: 'u1', name: 'Ada' }], error: null }
      const awaiting = isAwaitingQuery(q)
      if (isHead(q)) return { data: null, error: null, count: awaiting ? awaitingTotal : restTotal }
      const [from, to] = ops(q, 'range')[0] as number[]
      const rows = Array.from({ length: to - from + 1 }, (_, i) =>
        awaiting ? submission(`a${from + i}`) : submission(`r${from + i}`, 'reviewed', '2026-02-01')
      )
      return { data: rows, error: null }
    }
  }

  it('serves page 1 from the awaiting segment when it holds a full page', async () => {
    resolver = capstoneResolver(30, 50)
    const result = await ModerationService.getCapstonesPage()
    const fetches = dataQueries('capstone_submissions')
    expect(fetches).toHaveLength(1)
    expect(isAwaitingQuery(fetches[0])).toBe(true)
    expect(ops(fetches[0], 'range')[0]).toEqual([0, 24])
    // Oldest awaiting first.
    expect(ops(fetches[0], 'order')[0]).toEqual(['submitted_at', { ascending: true }])
    expect(result.total).toBe(80)
    expect(result.items).toHaveLength(25)
    expect(result.items[0]).toMatchObject({ id: 'a0', learnerName: 'Ada', wordCount: 3 })
    // Both segments are counted exactly.
    const heads = queries.filter((q) => q.table === 'capstone_submissions' && isHead(q))
    expect(heads.map((q) => (ops(q, 'select')[0] as any)[1])).toEqual([
      { count: 'exact', head: true },
      { count: 'exact', head: true },
    ])
  })

  it('splits a page across the awaiting and reviewed segments', async () => {
    resolver = capstoneResolver(10, 50)
    const result = await ModerationService.getCapstonesPage({ page: 1 })
    const fetches = dataQueries('capstone_submissions')
    const awaiting = fetches.find(isAwaitingQuery)!
    const rest = fetches.find((q) => !isAwaitingQuery(q))!
    expect(ops(awaiting, 'range')[0]).toEqual([0, 9])
    expect(ops(rest, 'range')[0]).toEqual([0, 14])
    expect(ops(rest, 'or')).toEqual([['status.neq.submitted,reviewed_at.not.is.null']])
    // Everything else newest first.
    expect(ops(rest, 'order')[0]).toEqual(['submitted_at', { ascending: false }])
    expect(result.items.map((c) => c.id).slice(9, 11)).toEqual(['a9', 'r0'])

    queries = []
    await ModerationService.getCapstonesPage({ page: 2 })
    const page2 = dataQueries('capstone_submissions')
    expect(page2).toHaveLength(1)
    expect(ops(page2[0], 'range')[0]).toEqual([15, 39])
  })

  it("'reviewed' is an exact status match with no awaiting segment", async () => {
    resolver = capstoneResolver(0, 5)
    const result = await ModerationService.getCapstonesPage({ status: 'reviewed' })
    const all = queries.filter((q) => q.table === 'capstone_submissions')
    expect(all.some(isAwaitingQuery)).toBe(false)
    for (const q of all) expect(ops(q, 'eq')).toEqual([['status', 'reviewed']])
    expect(result.total).toBe(5)
  })

  it("'submitted' keeps re-submitted rows that were already reviewed after the awaiting ones", async () => {
    resolver = capstoneResolver(2, 3)
    await ModerationService.getCapstonesPage({ status: 'submitted' })
    const rest = queries.filter((q) => q.table === 'capstone_submissions' && !isAwaitingQuery(q))
    for (const q of rest) {
      expect(ops(q, 'eq')).toEqual([['status', 'submitted']])
      expect(ops(q, 'not')).toEqual([['reviewed_at', 'is', null]])
    }
  })

  it('an unknown status falls back to all', async () => {
    resolver = capstoneResolver(0, 0)
    const result = await ModerationService.getCapstonesPage({ status: 'in_review' })
    expect(result).toMatchObject({ items: [], total: 0, failed: false })
    expect(queries.filter((q) => q.table === 'capstone_submissions').some(isAwaitingQuery)).toBe(true)
  })
})

describe('ModerationService.getCapstoneById', () => {
  it('returns null without querying for a malformed id', async () => {
    const result = await ModerationService.getCapstoneById('not-a-uuid')
    expect(result).toEqual({ capstone: null, failed: false })
    expect(queries).toHaveLength(0)
  })

  it('fetches the one row by id with its learner', async () => {
    resolver = (q) =>
      q.table === 'capstone_submissions'
        ? {
            data: { id: UUID, user_id: 'u1', module_slug: 'm', content: 'a b', status: 'submitted', is_public: false, submitted_at: '2026-01-01', reviewed_at: null },
            error: null,
          }
        : { data: [{ id: 'u1', name: 'Ada' }], error: null }
    const result = await ModerationService.getCapstoneById(UUID)
    const [q] = queries.filter((x) => x.table === 'capstone_submissions')
    expect(ops(q, 'eq')).toEqual([['id', UUID]])
    expect(result.failed).toBe(false)
    expect(result.capstone).toMatchObject({ id: UUID, learnerName: 'Ada', wordCount: 2 })
  })

  it('returns null for a missing row and failed on an error', async () => {
    resolver = () => ({ data: null, error: null })
    expect(await ModerationService.getCapstoneById(UUID)).toEqual({ capstone: null, failed: false })
    resolver = () => ({ data: null, error: { message: 'down' } })
    expect(await ModerationService.getCapstoneById(UUID)).toEqual({ capstone: null, failed: true })
  })
})
