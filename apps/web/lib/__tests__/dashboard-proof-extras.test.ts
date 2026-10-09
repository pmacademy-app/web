import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// Growth R4 / A6–A8: the proof card's lower row (PM Fellow, badges, level). Summaries are pure;
// the loaders resolve to null on any failure so the dashboard never breaks on them.

vi.mock('@/lib/fellow-requests-db', () => ({ getUserFellowState: vi.fn() }))
vi.mock('@/lib/badges-db', () => ({ getUserBadgesData: vi.fn() }))

import { summarizeBadges, summarizeFellow, summarizeLevel } from '@/lib/dashboard/proof-extras'
import { loadBadgeSummary, loadFellowSummary } from '@/lib/dashboard/proof-extras-db'
import { getUserFellowState } from '@/lib/fellow-requests-db'
import { getUserBadgesData } from '@/lib/badges-db'

afterEach(() => vi.clearAllMocks())

describe('summarizeFellow', () => {
  it('turns the readiness checklist into a rounded percent', () => {
    expect(summarizeFellow({ state: 'not_eligible', readiness: { completedCount: 5, totalCount: 7 } })).toEqual({
      state: 'not_eligible',
      readinessPercent: 71,
    })
  })

  it('is 0% for an empty checklist rather than NaN', () => {
    expect(summarizeFellow({ state: 'not_eligible', readiness: { completedCount: 0, totalCount: 0 } }).readinessPercent).toBe(0)
  })
})

describe('summarizeBadges', () => {
  it('reports exactly what the /badges payload reports', () => {
    expect(
      summarizeBadges({ totalEarned: 4, totalAvailable: 10, recentBadge: { definition: { name: 'Module Master' } } }),
    ).toEqual({ earned: 4, total: 10, latestName: 'Module Master' })
  })

  it('has no latest badge when none is earned', () => {
    expect(summarizeBadges({ totalEarned: 0, totalAvailable: 10, recentBadge: null })).toEqual({
      earned: 0,
      total: 10,
      latestName: null,
    })
  })
})

describe('summarizeLevel', () => {
  it('reports level, title and XP to the next level', () => {
    expect(summarizeLevel(100)).toEqual({ level: 1, title: 'Associate PM Trainee', xpRemaining: 150, isMaxLevel: false })
  })

  it('marks the top level', () => {
    expect(summarizeLevel(20000)).toMatchObject({ level: 9, xpRemaining: 0, isMaxLevel: true })
  })

  it('treats missing XP as zero', () => {
    expect(summarizeLevel(null).level).toBe(1)
  })
})

describe('proof extras loaders', () => {
  it('loadBadgeSummary uses the /badges data and resolves null when it fails', async () => {
    vi.mocked(getUserBadgesData).mockResolvedValueOnce({
      totalEarned: 2,
      totalAvailable: 10,
      completionPercentage: 20,
      allBadges: [],
      recentBadge: { definition: { name: 'First Step' } } as never,
    })
    await expect(loadBadgeSummary({} as SupabaseClient<Database>, 'user-1')).resolves.toEqual({
      earned: 2,
      total: 10,
      latestName: 'First Step',
    })

    vi.mocked(getUserBadgesData).mockRejectedValueOnce(new Error('boom'))
    await expect(loadBadgeSummary({} as SupabaseClient<Database>, 'user-1')).resolves.toBeNull()
  })

  it('loadFellowSummary resolves null when the Fellow state cannot be loaded', async () => {
    vi.mocked(getUserFellowState).mockRejectedValueOnce(new Error('boom'))
    await expect(loadFellowSummary({} as SupabaseClient<Database>, 'user-1')).resolves.toBeNull()
  })

  it('loadFellowSummary reduces the Settings payload', async () => {
    vi.mocked(getUserFellowState).mockResolvedValueOnce({
      state: 'eligible',
      canSubmit: true,
      isEligible: true,
      readiness: { completedCount: 7, totalCount: 7 } as never,
      latestRequest: null,
    })
    await expect(loadFellowSummary({} as SupabaseClient<Database>, 'user-1')).resolves.toEqual({
      state: 'eligible',
      readinessPercent: 100,
    })
  })
})

describe('dashboard wiring', () => {
  const page = readFileSync(path.resolve(__dirname, '../../app/(app)/dashboard/page.tsx'), 'utf8')

  it('loads the extras inside the existing Promise.all, not after it', () => {
    const start = page.indexOf('await Promise.all([')
    const end = page.indexOf('  ])', start)
    const batch = page.slice(start, end)
    expect(batch).toContain('loadFellowSummary(supabase, authUser.id)')
    expect(batch).toContain('loadBadgeSummary(supabase, authUser.id)')
    expect(page.match(/loadFellowSummary\(|loadBadgeSummary\(/g)).toHaveLength(2)
  })
})
