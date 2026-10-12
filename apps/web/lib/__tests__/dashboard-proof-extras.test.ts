import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase'

// Growth R4 / A6–A8: the proof card's lower row (PM Fellow, badges, level). Summaries are pure;
// the loaders resolve to null on any failure so the dashboard never breaks on them.


import { summarizeBadges, summarizeFellow, summarizeLevel } from '@/lib/dashboard/proof-extras'
import { loadProofExtras } from '@/lib/dashboard/proof-extras-db'
import { getPortfolioSettings, portfolioReadinessInputFromUserRow } from '@/lib/portfolio-db'


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

// ─── loadProofExtras: shared reads, never re-issued ──────────────────────────

type Row = Record<string, unknown>

/** A Supabase stand-in: every chain resolves to the table's canned response; each from() is logged. */
function fakeSupabase(responses: Record<string, { data: unknown; error?: unknown }>) {
  const tables: string[] = []
  const client = {
    from(table: string) {
      tables.push(table)
      const response = responses[table] ?? { data: null, error: { message: `unexpected table ${table}` } }
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'in', 'order', 'limit', 'not']) chain[method] = () => chain
      chain.maybeSingle = () => Promise.resolve({ error: null, ...response })
      chain.single = () => Promise.resolve({ error: null, ...response })
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve({ error: null, ...response }).then(resolve, reject)
      return chain
    },
  }
  return { client: client as unknown as SupabaseClient<Database>, tables }
}

const USER_ID = '11111111-1111-4111-8111-111111111111'
const profileRow = (overrides: Row = {}) =>
  ({
    id: USER_ID,
    username: 'ada',
    name: 'Ada Lovelace',
    bio: 'Product thinker building in public.',
    avatar_url: 'https://example.test/a.png',
    linkedin_url: 'https://linkedin.com/in/ada',
    github_url: null,
    website_url: null,
    is_portfolio_public: true,
    is_fellow: false,
    total_xp: 300,
    level: 2,
    current_streak: 3,
    longest_streak: 5,
    streak_freezes_available: 0,
    email: 'ada@example.test',
    ...overrides,
  }) as unknown as Database['public']['Tables']['users']['Row']

const publicCapstone = { id: 'c1', module_slug: 'discovery', status: 'reviewed', is_public: true }
const shared = (overrides: Partial<Parameters<typeof loadProofExtras>[2]> = {}) => ({
  profile: Promise.resolve(profileRow()),
  progressRows: Promise.resolve([{ lesson_id: 'les_a', status: 'completed', quiz_score: 100, quiz_attempts: 1 }]),
  capstoneRows: Promise.resolve([publicCapstone]),
  ...overrides,
})
const badgeTables = {
  badges: { data: [{ id: 'b1', key: 'first_lesson' }] },
  user_badges: { data: [{ badge_id: 'b1', earned_at: '2026-10-01T00:00:00Z' }] },
}

describe('loadProofExtras', () => {
  it('reads only fellow_requests, badges and user_badges: the profile, progress and capstones are shared', async () => {
    const db = fakeSupabase({ fellow_requests: { data: null }, ...badgeTables })

    const extras = await loadProofExtras(db.client, USER_ID, shared())

    expect([...db.tables].sort()).toEqual(['badges', 'fellow_requests', 'user_badges'])
    expect(extras.fellow?.state).toBe('eligible')
    expect(extras.fellow?.readinessPercent).toBe(100)
    expect(extras.badges?.earned).toBeGreaterThanOrEqual(1)
    expect(extras.level).toMatchObject({ level: 2 })
  })

  it.each([
    ['pending', 'pending'],
    ['rejected', 'eligible'], // eligible again after a rejection, as in Settings
  ])('maps a latest %s request to %s', async (status, state) => {
    const db = fakeSupabase({ fellow_requests: { data: { status } }, ...badgeTables })
    expect((await loadProofExtras(db.client, USER_ID, shared())).fellow?.state).toBe(state)
  })

  it('reports a Fellow regardless of readiness', async () => {
    const db = fakeSupabase({ fellow_requests: { data: null }, ...badgeTables })
    const extras = await loadProofExtras(db.client, USER_ID, shared({ profile: Promise.resolve(profileRow({ is_fellow: true, bio: null })) }))
    expect(extras.fellow?.state).toBe('approved')
  })

  it('counts only public submitted capstones toward readiness', async () => {
    const db = fakeSupabase({ fellow_requests: { data: null }, ...badgeTables })
    const extras = await loadProofExtras(
      db.client,
      USER_ID,
      shared({ capstoneRows: Promise.resolve([{ ...publicCapstone, is_public: false }, { ...publicCapstone, id: 'c2', status: 'draft' }]) }),
    )
    expect(extras.fellow?.state).toBe('not_eligible')
  })

  it('hides only the Fellow cell when its read fails', async () => {
    const db = fakeSupabase({ fellow_requests: { data: null, error: { message: 'boom' } }, ...badgeTables })
    const extras = await loadProofExtras(db.client, USER_ID, shared())
    expect(extras.fellow).toBeNull()
    expect(extras.badges).not.toBeNull()
  })

  it('hides Fellow and badges when a shared read fails, and never rejects', async () => {
    const db = fakeSupabase({})
    const extras = await loadProofExtras(db.client, USER_ID, shared({ progressRows: Promise.reject(new Error('down')) }))
    expect(extras).toMatchObject({ fellow: null, badges: null, level: { level: 2 } })
    expect(db.tables).toEqual([])
  })

  it('hides everything on a first visit with no profile row yet', async () => {
    const db = fakeSupabase({})
    expect(await loadProofExtras(db.client, USER_ID, shared({ profile: Promise.resolve(null) }))).toEqual({
      fellow: null,
      badges: null,
      level: null,
      referralRewardXp: 50,
    })
  })
})

describe('portfolioReadinessInputFromUserRow', () => {
  it.each([
    ['a complete row', profileRow()],
    ['no username, null visibility and blanks', profileRow({ username: null, is_portfolio_public: null, bio: null, name: null })],
  ])('maps %s exactly as Settings (getPortfolioSettings) does', async (_label, row) => {
    const db = fakeSupabase({ users: { data: row } })
    const settings = await getPortfolioSettings(db.client, USER_ID)

    expect(portfolioReadinessInputFromUserRow(row, USER_ID, 1)).toEqual({
      name: settings.name,
      username: settings.username,
      bio: settings.bio,
      avatarUrl: settings.avatarUrl,
      linkedinUrl: settings.linkedinUrl,
      githubUrl: settings.githubUrl,
      websiteUrl: settings.websiteUrl,
      isPortfolioPublic: settings.isPortfolioPublic,
      publicCapstonesCount: 1,
    })
  })
})

describe('dashboard wiring', () => {
  const page = readFileSync(path.resolve(__dirname, '../../app/(app)/dashboard/page.tsx'), 'utf8')

  it('issues each shared read once and hands the same promises to the extras loader', () => {
    expect(page.match(/from\('user_lesson_progress'\)/g)).toHaveLength(1)
    expect(page.match(/from\('capstone_submissions'\)/g)).toHaveLength(1)
    expect(page.match(/getCurrentUserProfile\(\)/g)).toHaveLength(1)
    expect(page).toMatch(/profile: profilePromise,\s*progressRows: progressPromise,\s*capstoneRows: capstonesPromise/)
  })

  it('streams the lower row inside its own Suspense boundary', () => {
    expect(page).toMatch(/<Suspense fallback=\{<ProofExtrasSkeleton \/>\}>\s*<ProofExtrasSlot/)
  })
})
