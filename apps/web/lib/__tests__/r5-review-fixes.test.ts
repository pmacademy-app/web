import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Growth R5 phase 2-4 review fixes that are not covered by their feature suites.

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: cache.revalidatePath, revalidateTag: vi.fn() }))

import { revalidateCapstoneOgCards } from '@/lib/og/revalidate-capstone-cards'
import { fetchAllRows } from '@/lib/db/pagination'
import { applicableNudges } from '@/lib/growth/proof-nudges'
import type { ProofState } from '@/lib/growth/proof-state'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'

const WEB = path.resolve(__dirname, '../..')
const source = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8')

beforeEach(() => cache.revalidatePath.mockReset())

describe('capstone OG card invalidation', () => {
  it('drops every capstone card of a learner, or just the named one', () => {
    revalidateCapstoneOgCards('ada')
    expect(cache.revalidatePath).toHaveBeenCalledTimes(Object.keys(CAPSTONE_DEFINITIONS).length)
    expect(cache.revalidatePath).toHaveBeenCalledWith('/api/og/portfolio/ada/capstones/discovery')

    cache.revalidatePath.mockReset()
    revalidateCapstoneOgCards('ada', ['strategy'])
    expect(cache.revalidatePath.mock.calls).toEqual([['/api/og/portfolio/ada/capstones/strategy']])
  })

  it('runs wherever the portfolio card is invalidated', () => {
    // Old and new handle; the behaviour is covered in og-card-canonical-path.test.ts. Admin
    // writes (user edits, capstone review) moved to the admin console, which asks this app
    // to drop the card paths through POST /api/internal/revalidate.
    expect(source('app/api/settings/portfolio/route.ts')).toContain('revalidateCapstoneOgCards(handle)')
  })

  it('keeps the stale window short on the capstone card', () => {
    const route = source('app/api/og/portfolio/[username]/capstones/[moduleSlug]/route.tsx')
    expect(route).not.toContain('stale-while-revalidate=86400')
  })
})

describe('fetchAllRows', () => {
  it('reads past the 1000-row cap page by page', async () => {
    const all = Array.from({ length: 2300 }, (_, i) => i)
    const ranges: Array<[number, number]> = []
    const data = await fetchAllRows<number>(async (from, to) => {
      ranges.push([from, to])
      return { data: all.slice(from, to + 1), error: null }
    })
    expect(data).toHaveLength(2300)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('fails the whole read on a failed page', async () => {
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'down' } }))).rejects.toThrow('down')
  })
})

describe('Fellow nudge eligibility', () => {
  const state = (latest: ProofState['latestFellowRequestStatus']): ProofState => ({
    portfolio: { isPublic: true, readyButPrivate: false, readinessPercent: 100 },
    fellowState: 'eligible',
    latestFellowRequestStatus: latest,
    nextCapstone: null,
    certificate: { completedLessons: 0, totalLessons: 90, earned: false },
  })

  it('never tells a revoked Fellow (latest request approved) that they qualify', () => {
    expect(applicableNudges(state('approved'))).toEqual([])
    expect(applicableNudges(state(null))).toEqual(['nudge.fellow_eligible'])
  })
})

describe('public portfolio lookup', () => {
  // Perf plan item 13: an exact match on the lowercased handle replaced the escaped ILIKE. `eq`
  // has no wildcards, so /p/a_b can never resolve to another learner, and the unique index serves it.
  it('matches the username exactly, so `_` and `%` are never wildcards', () => {
    const code = source('lib/portfolio-db.ts')
    const body = code.slice(
      code.indexOf('export async function getPublicPortfolioData'),
      code.indexOf('export const getDedupedPublicPortfolioData')
    )
    expect(body).toContain(".eq('username', sanitizedUsername)")
    expect(body).not.toContain('.ilike(')
    expect(source('lib/db/escape-like.ts')).toContain('%_]/g')
  })
})
