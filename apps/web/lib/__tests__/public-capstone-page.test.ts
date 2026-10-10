import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PublicCapstoneItem, PublicPortfolioPayload } from '@/lib/portfolio-db'

// Growth R5 / B13a: one public capstone as its own page. It exists only for a capstone the public
// portfolio already shows; every other case is the same 404, so nothing private leaks.

const loader = vi.hoisted(() => ({ getDedupedPublicPortfolioData: vi.fn() }))
vi.mock('@/lib/portfolio-db', () => loader)

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

beforeEach(() => loader.getDedupedPublicPortfolioData.mockReset())

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
