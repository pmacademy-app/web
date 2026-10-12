import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Growth R5 phase 2-4 review fixes that are not covered by their feature suites.

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: cache.revalidatePath, revalidateTag: vi.fn() }))

import { revalidateCapstoneOgCards } from '@/lib/og/revalidate-capstone-cards'
import { fetchAllRows } from '@/lib/growth/fetch-all-rows'
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

  it('runs wherever the portfolio card is invalidated, and when a review changes visibility', () => {
    // Old and new handle; the behaviour is covered in og-card-canonical-path.test.ts.
    expect(source('app/api/settings/portfolio/route.ts')).toContain('revalidateCapstoneOgCards(handle)')
    expect(source('lib/admin/service.ts').match(/revalidateCapstoneOgCards\(userRow\.username\)/g)).toHaveLength(2)
    expect(source('lib/admin/moderation-service.ts')).toContain('revalidateCapstoneOgCards(owner.username, [current.module_slug])')
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
    const { data, error } = await fetchAllRows<number>(async (from, to) => {
      ranges.push([from, to])
      return { data: all.slice(from, to + 1), error: null }
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(2300)
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('reports a failed page', async () => {
    const result = await fetchAllRows(async () => ({ data: null, error: { message: 'down' } }))
    expect(result.error).toEqual({ message: 'down' })
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
  it('escapes ILIKE wildcards in the username before the lookup', () => {
    const code = source('lib/portfolio-db.ts')
    expect(code).toContain(".ilike('username', sanitizedUsername.replace(")
    expect(code).toContain('%_]/g')
  })
})
