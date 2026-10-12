import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PublicCapstoneItem, PublicPortfolioPayload } from '@/lib/portfolio-db'

// Growth R5 / B13a: one public capstone as its own page. It exists only for a capstone the public
// portfolio already shows; every other case is the same 404, so nothing private leaks.

const loader = vi.hoisted(() => ({ getDedupedPublicPortfolioData: vi.fn() }))
vi.mock('@/lib/portfolio-db', () => loader)
// The real loader (used by the visibility tests below) reads the skill radar; it is not under test.
vi.mock('@/lib/skillRadar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/skillRadar')>()),
  getSkillRadarSummary: vi.fn().mockResolvedValue(null),
}))

import { buildCapstoneJsonLd, findPublicCapstone } from '@/lib/portfolio-capstone-page'
import PublicCapstonePage, { generateMetadata } from '../../app/(portfolio)/p/[username]/capstones/[moduleSlug]/page'

const capstone: PublicCapstoneItem = {
  id: 'cap-1',
  moduleSlug: 'discovery',
  moduleNumber: 2,
  moduleTitle: 'Users, Problems & Discovery',
  title: 'Problem Discovery Brief',
  deliverableType: 'Research Brief',
  content: 'The problem we found was <script>alert(1)</script>.',
  submittedAt: '2026-10-01T00:00:00.000Z',
  wordCount: 840,
  status: 'reviewed',
  competencyCluster: 'discovery',
  learningObjectives: ['Frame a problem'],
  reflection: null,
}

const portfolio = (overrides: Partial<PublicPortfolioPayload['user']> = {}): PublicPortfolioPayload =>
  ({
    user: { id: 'u1', username: 'ada', name: 'Ada Lovelace', isPortfolioPublic: true, ...overrides },
    capstones: [capstone],
  }) as unknown as PublicPortfolioPayload

const params = (moduleSlug: string, username = 'ada') => ({ params: Promise.resolve({ username, moduleSlug }) })

// Braces on purpose: mockReset() returns the mock, and vitest calls a function returned from
// beforeEach as that test's cleanup, which would invoke the loader with no arguments.
beforeEach(() => {
  loader.getDedupedPublicPortfolioData.mockReset()
})

describe('findPublicCapstone', () => {
  it('finds a capstone the public portfolio shows', () => {
    expect(findPublicCapstone(portfolio(), 'discovery')).toBe(capstone)
  })

  it.each([
    ['no portfolio', null, 'discovery'],
    ['a private portfolio', portfolio({ isPortfolioPublic: false }), 'discovery'],
    ['a capstone the portfolio does not show', portfolio(), 'strategy'],
  ])('returns null for %s', (_label, data, slug) => {
    expect(findPublicCapstone(data, slug)).toBeNull()
  })
})

describe('buildCapstoneJsonLd', () => {
  it('describes a CreativeWork authored by the portfolio owner', () => {
    expect(
      buildCapstoneJsonLd({
        capstone,
        authorName: 'Ada Lovelace',
        portfolioUrl: 'https://prodily.example/p/ada',
        pageUrl: 'https://prodily.example/p/ada/capstones/discovery',
        publisherName: 'Prodily PM Academy',
      }),
    ).toMatchObject({
      '@type': 'CreativeWork',
      name: 'Problem Discovery Brief',
      url: 'https://prodily.example/p/ada/capstones/discovery',
      author: { '@type': 'Person', name: 'Ada Lovelace', url: 'https://prodily.example/p/ada' },
    })
  })
})

describe('/p/[username]/capstones/[moduleSlug]', () => {
  it('is a 404, and not indexed, for anything the public portfolio does not show', async () => {
    loader.getDedupedPublicPortfolioData.mockResolvedValue(portfolio())

    await expect(PublicCapstonePage(params('strategy'))).rejects.toThrow()
    expect(await generateMetadata(params('strategy'))).toMatchObject({ robots: { index: false } })

    loader.getDedupedPublicPortfolioData.mockResolvedValue(null)
    await expect(PublicCapstonePage(params('discovery', 'ghost'))).rejects.toThrow()
  })

  it('sets a canonical URL and an OG image for a public capstone', async () => {
    loader.getDedupedPublicPortfolioData.mockResolvedValue(portfolio())

    const metadata = await generateMetadata(params('discovery'))

    expect(String(metadata.alternates?.canonical)).toMatch(/\/p\/ada\/capstones\/discovery$/)
    expect(JSON.stringify(metadata.openGraph)).toMatch(/\/api\/og\/portfolio\/ada\/capstones\/discovery/)
    expect(metadata.robots).toMatchObject({ index: true })
  })
})

// Owner decision, 2026-10-11: a submitted capstone does not wait for its review. It is public as
// soon as the portfolio is public and the capstone is public. These run the real
// getPublicPortfolioData against rows, so the rule is pinned where it is applied (the query),
// not only in the page helper.

type Row = Record<string, unknown>

/** A minimal PostgREST-like client: it applies the filters the loader asks for to in-memory rows. */
function fakeClient(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: (n: number) => ((rows = rows.slice(0, n)), chain),
        eq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] === value)), chain),
        // As in SQL, a NULL never satisfies `<>`.
        neq: (col: string, value: unknown) => (
          (rows = rows.filter((r) => r[col] != null && r[col] !== value)), chain
        ),
        in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), chain),
        ilike: (col: string, pattern: string) => {
          const literal = pattern.replace(/\\(.)/g, '$1').toLowerCase()
          rows = rows.filter((r) => String(r[col] ?? '').toLowerCase() === literal)
          return chain
        },
        then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      }
      return chain
    },
  }
}

describe('capstone visibility through the real portfolio loader', () => {
  const user = (overrides: Row = {}): Row => ({
    id: 'u1',
    username: 'ada',
    name: 'Ada Lovelace',
    is_portfolio_public: true,
    total_xp: 0,
    ...overrides,
  })
  const submission = (overrides: Row = {}): Row => ({
    id: 'cap-1',
    user_id: 'u1',
    module_slug: 'discovery',
    content: 'What we learned from twelve interviews.',
    submitted_at: '2026-10-01T00:00:00.000Z',
    status: 'submitted',
    is_public: true,
    ...overrides,
  })

  async function serve(tables: Record<string, Row[]>) {
    const actual = await vi.importActual<typeof import('@/lib/portfolio-db')>('@/lib/portfolio-db')
    loader.getDedupedPublicPortfolioData.mockImplementation((username: string) =>
      actual.getPublicPortfolioData(fakeClient(tables) as never, username),
    )
  }

  const expectNotFound = async (moduleSlug = 'discovery') => {
    expect(findPublicCapstone(await loader.getDedupedPublicPortfolioData('ada'), moduleSlug)).toBeNull()
    await expect(PublicCapstonePage(params(moduleSlug))).rejects.toThrow()
    expect(await generateMetadata(params(moduleSlug))).toMatchObject({ robots: { index: false } })
  }

  it('shows a submitted, not yet reviewed capstone when it and the portfolio are public', async () => {
    await serve({ users: [user()], capstone_submissions: [submission()] })

    const found = findPublicCapstone(await loader.getDedupedPublicPortfolioData('ada'), 'discovery')

    expect(found).toMatchObject({ id: 'cap-1', moduleSlug: 'discovery', status: 'submitted' })
    const metadata = await generateMetadata(params('discovery'))
    expect(metadata.robots).toMatchObject({ index: true })
    expect(String(metadata.alternates?.canonical)).toMatch(/\/p\/ada\/capstones\/discovery$/)
  })

  it('is not found for a submitted capstone the learner made private', async () => {
    await serve({ users: [user()], capstone_submissions: [submission({ is_public: false })] })

    await expectNotFound()
  })

  it('is not found on a private portfolio, even for a public capstone', async () => {
    await serve({ users: [user({ is_portfolio_public: false })], capstone_submissions: [submission()] })

    await expectNotFound()
  })

  it('is not found for a slug the learner has no capstone for', async () => {
    await serve({ users: [user()], capstone_submissions: [submission()] })

    await expectNotFound('strategy')
  })

  it('is not found for a capstone that was never submitted', async () => {
    await serve({ users: [user()], capstone_submissions: [submission({ status: 'draft' })] })

    await expectNotFound()
  })
})
