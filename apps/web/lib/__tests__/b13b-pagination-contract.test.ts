import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  DEFAULT_PAGE_SIZE,
  MAX_OFFSET,
  MAX_PAGE_SIZE,
  clampPagination,
  paginated,
  paginationQuerySchema,
  toRange,
} from '@/lib/api/pagination'

/**
 * B13-B — one pagination contract, and a cap a caller cannot raise.
 *
 * Before this batch every list endpoint invented its own: `page`/`limit` capped at 50,
 * `page`/`pageSize` capped at 100, `limit` alone capped at 100, a hard-coded 5 with no
 * parameter, and several with no bound at all. The envelope disagreed too — `items`,
 * `data`, `messages`, `alerts`, `requests`.
 *
 * The roadmap frames the cap as an abuse control, not a convenience, so the clamp tests
 * below are the security tests of this batch: an unbounded list endpoint is a cheap
 * amplification primitive, and a default the caller can override is not a control.
 */

const ROOT = path.resolve(import.meta.dirname, '../../')
const API_DIR = path.join(ROOT, 'app/api')
const read = (abs: string) => readFileSync(abs, 'utf8')

function allRouteFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry === 'route.ts') out.push(full)
    }
  }
  walk(API_DIR)
  return out
}

describe('B13-B — the page size is capped server-side', () => {
  it('clamps a caller asking for more than the maximum', () => {
    expect(clampPagination({ limit: 100_000 }).limit).toBe(MAX_PAGE_SIZE)
    expect(clampPagination({ limit: MAX_PAGE_SIZE + 1 }).limit).toBe(MAX_PAGE_SIZE)
  })

  it('clamps through the schema too, not only the helper', () => {
    // A route may validate with the schema or clamp by hand; both are the control.
    expect(paginationQuerySchema.parse({ limit: '100000' }).limit).toBe(DEFAULT_PAGE_SIZE)
    expect(paginationQuerySchema.parse({ limit: '100' }).limit).toBe(100)
  })

  it('refuses a zero or negative page size rather than returning everything', () => {
    // `limit=0` on a PostgREST range is not "no rows"; treating it as unset would be a
    // way to ask for the unbounded read this contract exists to prevent.
    expect(clampPagination({ limit: 0 }).limit).toBe(1)
    expect(clampPagination({ limit: -5 }).limit).toBe(1)
  })

  it('caps how deep a caller may page', () => {
    // An offset is an instruction to count and discard rows, so an unbounded offset is
    // a slow query anyone can request.
    expect(clampPagination({ offset: 1_000_000 }).offset).toBe(MAX_OFFSET)
    expect(clampPagination({ offset: -1 }).offset).toBe(0)
  })

  it('falls back to the default rather than failing on a malformed value', () => {
    for (const bad of ['abc', '', null, undefined, NaN, Infinity]) {
      expect(clampPagination({ limit: bad as never }).limit).toBe(DEFAULT_PAGE_SIZE)
      expect(clampPagination({ offset: bad as never }).offset).toBe(0)
    }
  })

  it('floors a fractional page size instead of handing it to the database', () => {
    expect(clampPagination({ limit: 10.9 }).limit).toBe(10)
    expect(clampPagination({ offset: 5.7 }).offset).toBe(5)
  })

  it('accepts string input, because query parameters are strings', () => {
    expect(clampPagination({ limit: '25', offset: '50' })).toEqual({ limit: 25, offset: 50 })
  })
})

describe('B13-B — the range translation is inclusive and off-by-one free', () => {
  it('maps the first page to [0, limit - 1]', () => {
    expect(toRange({ limit: 20, offset: 0 })).toEqual({ from: 0, to: 19 })
  })

  it('maps a later page without overlapping the previous one', () => {
    const first = toRange({ limit: 20, offset: 0 })
    const second = toRange({ limit: 20, offset: 20 })
    // PostgREST `.range()` is inclusive at both ends; an overlap here would repeat a row
    // on every page boundary and still look correct in the UI.
    expect(second.from).toBe(first.to + 1)
    expect(second).toEqual({ from: 20, to: 39 })
  })

  it('handles a single-row page', () => {
    expect(toRange({ limit: 1, offset: 7 })).toEqual({ from: 7, to: 7 })
  })
})

describe('B13-B — the response envelope', () => {
  const page = { limit: 20, offset: 0 }

  it('wraps items with the applied window', () => {
    const result = paginated([1, 2, 3], { limit: 20, offset: 40 }, 100)
    expect(result.items).toEqual([1, 2, 3])
    expect(result.pagination.limit).toBe(20)
    expect(result.pagination.offset).toBe(40)
    expect(result.pagination.total).toBe(100)
  })

  it('derives hasMore from the total when the endpoint counted', () => {
    expect(paginated(new Array(20).fill(0), page, 100).pagination.hasMore).toBe(true)
    expect(paginated(new Array(20).fill(0), page, 20).pagination.hasMore).toBe(false)
    expect(paginated(new Array(5).fill(0), { limit: 20, offset: 95 }, 100).pagination.hasMore).toBe(
      false
    )
  })

  it('derives hasMore from a short page when the endpoint did not count', () => {
    // A short page is the only reliable "last page" signal without a count — the same
    // rule `fetchAllRows` uses for server-side paging.
    expect(paginated(new Array(20).fill(0), page).pagination.hasMore).toBe(true)
    expect(paginated(new Array(3).fill(0), page).pagination.hasMore).toBe(false)
  })

  it('reports total as null rather than guessing it from the page', () => {
    // `items.length` is not the total, and returning it as one would be a confident lie
    // that a client would render as a page count.
    const result = paginated([1, 2, 3], page)
    expect(result.pagination.total).toBeNull()
  })

  it('handles an empty page at a valid offset', () => {
    const result = paginated([], { limit: 20, offset: 200 }, 100)
    expect(result.items).toEqual([])
    expect(result.pagination.hasMore).toBe(false)
  })

  it('round-trips: consecutive pages cover every row exactly once', () => {
    const rows = Array.from({ length: 55 }, (_, i) => i)
    const limit = 20
    const seen: number[] = []
    let offset = 0
    let guard = 0

    for (;;) {
      if (guard++ > 10) throw new Error('pagination did not terminate')
      const window = clampPagination({ limit, offset })
      const { from, to } = toRange(window)
      const slice = rows.slice(from, to + 1)
      const result = paginated(slice, window, rows.length)
      seen.push(...result.items)
      if (!result.pagination.hasMore) break
      offset += limit
    }

    expect(seen).toEqual(rows)
    expect(new Set(seen).size).toBe(rows.length)
  })
})

describe('B13-B — list endpoints conform', () => {
  /**
   * The list-returning routes this batch migrated, with the ad-hoc contract each used
   * to have. Named individually rather than detected, so a route dropping out of the
   * contract is a test failure rather than a silently smaller scan.
   */
  const MIGRATED = [
    'notifications/route.ts',
    'admin/contact/route.ts',
    'admin/emails/broadcasts/route.ts',
    'admin/fellow-requests/route.ts',
    'admin/system/alerts/route.ts',
    'announcements/active/route.ts',
  ]

  it.each(MIGRATED)('%s uses the shared pagination contract', (rel) => {
    const source = read(path.join(API_DIR, rel))
    expect(source).toContain("from '@/lib/api/pagination'")
  })

  it.each(MIGRATED)('%s no longer hand-rolls a page cap', (rel) => {
    const source = read(path.join(API_DIR, rel))
    // The cap is the security control, so the thing that must not reappear is a local
    // ceiling — `Math.min(50, …)` / `Math.min(100, …)` — competing with MAX_PAGE_SIZE.
    //
    // Reading a legacy parameter *name* is a different matter and is deliberately still
    // allowed: `notifications` and `broadcasts` accept the `page` / `pageSize` names
    // their deployed clients already send and translate them into the shared window, so
    // the rollout does not require the API and the console to deploy in lockstep. The
    // translated value still goes through `clampPagination`.
    expect(source).not.toMatch(/Math\.min\(\s*(?:50|100)\s*,/)
  })

  it.each(MIGRATED)('%s derives its bound from the shared clamp, not a local one', (rel) => {
    const source = read(path.join(API_DIR, rel))
    expect(source).toMatch(/clampPagination\(/)
  })

  it('no list route returns rows without a bound', () => {
    const offenders: string[] = []

    for (const abs of allRouteFiles()) {
      const source = read(abs)
      const rel = path.relative(API_DIR, abs).split(path.sep).join('/')
      const get = source.slice(source.indexOf('export const GET'))
      if (!source.includes('export const GET')) continue

      // A select that reaches the client without a range, an explicit limit, a shared
      // pagination import, or a `.single()`/`.maybeSingle()` narrowing.
      const selectsRows = /\.select\(/.test(get)
      const bounded =
        /\.range\(/.test(get) ||
        /\.limit\(/.test(get) ||
        /\.single\(\)/.test(get) ||
        /\.maybeSingle\(\)/.test(get) ||
        /head:\s*true/.test(get) ||
        source.includes("from '@/lib/api/pagination'") ||
        source.includes('fetchAllRows')

      if (selectsRows && !bounded) offenders.push(rel)
    }

    expect(offenders).toEqual([])
  })
})

describe('B13-B — the versioning policy is documented', () => {
  const contract = readFileSync(path.join(ROOT, '../../docs/API_CONTRACT.md'), 'utf8')

  it('states that the app has no API versioning scheme', () => {
    expect(contract).toMatch(/no API versioning/i)
  })

  it('records why /api/v2 is not a version boundary', () => {
    // The four routes under /api/v2/lessons/* are a slug -> stable-id migration
    // artifact; their v1 counterparts were deleted, so there is no v1 to be a version of.
    expect(contract).toContain('/api/v2/lessons')
    expect(contract).toMatch(/D-04/)
    expect(contract).toMatch(/D-01/)
  })

  it('tells a new route where to live', () => {
    expect(contract).toMatch(/\/api\/<resource>/)
  })

  it('documents the pagination envelope it just established', () => {
    expect(contract).toContain('hasMore')
    expect(contract).toContain('MAX_PAGE_SIZE')
  })
})
