import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'

// OG cards are cached per URL path while the username lookup ignores case, so every card must live
// under one path per learner (the lowercase one) and every purge must target it. Otherwise a card
// fetched as /api/og/portfolio/ALICE/... outlives the learner going private.

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getPublicPortfolioData: vi.fn(),
  getDedupedPublicPortfolioData: vi.fn(),
  updatePortfolioSettings: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath, revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: vi.fn(() => ({})) }))
vi.mock('@/lib/portfolio-db', () => ({
  getPublicPortfolioData: mocks.getPublicPortfolioData,
  getDedupedPublicPortfolioData: mocks.getDedupedPublicPortfolioData,
  updatePortfolioSettings: mocks.updatePortfolioSettings,
  getPortfolioSettings: vi.fn(),
  getLearnerSubmittedCapstones: vi.fn(),
  incrementPortfolioViewCount: vi.fn(),
  DEFAULT_PORTFOLIO_LAYOUT: [],
  PortfolioValidationError: class PortfolioValidationError extends Error {},
}))
// The route wrapper is not under test: hand the handler straight back.
vi.mock('@/lib/api/with-route', () => ({
  withRoute: (_config: unknown, handler: unknown) => handler,
  RouteError: class RouteError extends Error {},
}))
vi.mock('@/lib/api/actor', () => ({ requireUserId: () => 'u1' }))

import { GET as capstoneCard } from '../../app/api/og/portfolio/[username]/capstones/[moduleSlug]/route'
import { GET as portfolioCard } from '../../app/api/og/portfolio/[username]/route'
import { POST as savePortfolioSettings } from '../../app/api/settings/portfolio/route'
import { generateMetadata as capstoneMetadata } from '../../app/(portfolio)/p/[username]/capstones/[moduleSlug]/page'
import { generateMetadata as portfolioMetadata } from '../../app/(portfolio)/p/[username]/page'
import { revalidateCapstoneOgCards } from '@/lib/og/revalidate-capstone-cards'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'

const portfolio = (username = 'alice') =>
  ({
    user: { id: 'u1', username, name: 'Alice Liddell', bio: '', isFellow: false, isPortfolioPublic: true },
    capstones: [
      {
        id: 'c1',
        moduleSlug: 'discovery',
        moduleNumber: 2,
        moduleTitle: 'Users, Problems & Discovery',
        title: 'Problem Discovery Brief',
        deliverableType: 'Research Brief',
      },
    ],
  }) as unknown as PublicPortfolioPayload

const request = new Request('http://localhost/api/og')
const getCapstoneCard = (username: string, moduleSlug = 'discovery') =>
  capstoneCard(request, { params: Promise.resolve({ username, moduleSlug }) })
const getPortfolioCard = (username: string) => portfolioCard(request, { params: Promise.resolve({ username }) })

/** Everything an observer can see of a response. */
const observable = async (res: Response) => ({
  status: res.status,
  headers: [...res.headers.entries()].sort(),
  body: Buffer.from(await res.arrayBuffer()).toString('base64'),
})

const purged = () => mocks.revalidatePath.mock.calls.map(([path]) => path as string)

beforeEach(() => {
  mocks.revalidatePath.mockReset()
  mocks.getPublicPortfolioData.mockReset()
  mocks.getDedupedPublicPortfolioData.mockReset()
  mocks.updatePortfolioSettings.mockReset()
})

describe('capstone card: one cache path per learner', () => {
  it.each(['ALICE', 'Alice', ' alice'])('sends %j to the lowercase path instead of rendering a titled card', async (typed) => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())

    const res = await getCapstoneCard(typed)

    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/api/og/portfolio/alice/capstones/discovery')
    expect(res.headers.get('content-type') ?? '').not.toContain('image/png')
  })

  it('still renders the titled card on the lowercase path', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())

    const res = await getCapstoneCard('alice')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=600')
  })

  it('answers a non-lowercase username the same whether or not the learner exists, without a lookup', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())
    const existing = await observable(await getCapstoneCard('ALICE'))
    mocks.getPublicPortfolioData.mockResolvedValue(null)
    const unknown = await observable(await getCapstoneCard('ALICE'))

    expect(existing).toEqual(unknown)
    expect(mocks.getPublicPortfolioData).not.toHaveBeenCalled()
  })

  it('keeps the redirect on this route, with the typed slug encoded', async () => {
    const res = await getCapstoneCard('ALICE', '../x y')

    expect(res.headers.get('location')).toBe('/api/og/portfolio/alice/capstones/..%2Fx%20y')
  })

  it('never titles a card under a slug that differs in case', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())

    const res = await getCapstoneCard('alice', 'Discovery')

    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  })
})

describe('portfolio card: one cache path per learner', () => {
  it('sends a non-lowercase username to the lowercase path before any lookup', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())

    const res = await getPortfolioCard('ALICE')

    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('/api/og/portfolio/alice')
    expect(mocks.getPublicPortfolioData).not.toHaveBeenCalled()
  })

  it('still renders the card on the lowercase path', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())

    const res = await getPortfolioCard('alice')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
  })
})

describe('card invalidation targets the lowercase path', () => {
  it('purges the lowercase capstone paths for a stored mixed-case username', () => {
    revalidateCapstoneOgCards('Alice', ['strategy'])

    expect(purged()).toContain('/api/og/portfolio/alice/capstones/strategy')
    expect(purged()).toContain('/api/og/portfolio/Alice/capstones/strategy')
  })

  it('purges each path once when the username is already lowercase', () => {
    revalidateCapstoneOgCards('alice')

    expect(purged()).toHaveLength(Object.keys(CAPSTONE_DEFINITIONS).length)
  })

  it('purges the cards of both handles when a learner changes username', async () => {
    mocks.updatePortfolioSettings.mockResolvedValue({
      success: true,
      previousUsername: 'Alice',
      settings: { username: 'wonderland' },
    })

    await (savePortfolioSettings as unknown as (ctx: unknown) => Promise<Response>)({
      request: new Request('http://localhost/api/settings/portfolio', { method: 'POST', body: '{}' }),
      actor: {},
    })

    for (const handle of ['alice', 'wonderland']) {
      expect(purged()).toContain(`/api/og/portfolio/${handle}`)
      for (const slug of Object.keys(CAPSTONE_DEFINITIONS)) {
        expect(purged()).toContain(`/api/og/portfolio/${handle}/capstones/${slug}`)
      }
    }
  })
})

describe('built card URLs use the lowercase username', () => {
  it('on the capstone page, even when the stored username has capitals', async () => {
    mocks.getDedupedPublicPortfolioData.mockResolvedValue(portfolio('Alice'))

    const metadata = await capstoneMetadata({ params: Promise.resolve({ username: 'Alice', moduleSlug: 'discovery' }) })

    expect(JSON.stringify(metadata.openGraph)).toMatch(/\/api\/og\/portfolio\/alice\/capstones\/discovery"/)
    expect(JSON.stringify(metadata.twitter)).toMatch(/\/api\/og\/portfolio\/alice\/capstones\/discovery"/)
  })

  it('on the portfolio page, even when the visitor typed capitals', async () => {
    mocks.getDedupedPublicPortfolioData.mockResolvedValue(portfolio())

    const metadata = await portfolioMetadata({ params: Promise.resolve({ username: 'ALICE' }) })

    expect(JSON.stringify(metadata.openGraph)).toMatch(/\/api\/og\/portfolio\/alice"/)
    expect(JSON.stringify(metadata.twitter)).toMatch(/\/api\/og\/portfolio\/alice"/)
  })
})
