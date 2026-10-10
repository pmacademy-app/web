import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'

// Growth R5 / B13b: the capstone OG card renders only for a capstone the public portfolio shows.

const mocks = vi.hoisted(() => ({ getPublicPortfolioData: vi.fn(), createServiceRoleClient: vi.fn(() => ({})) }))
vi.mock('@/lib/portfolio-db', () => ({ getPublicPortfolioData: mocks.getPublicPortfolioData }))
vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: mocks.createServiceRoleClient }))

import { GET } from '../../app/api/og/portfolio/[username]/capstones/[moduleSlug]/route'

const portfolio = (isPortfolioPublic = true) =>
  ({
    user: { id: 'u1', username: 'ada', name: 'Ada Lovelace', isPortfolioPublic },
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

const get = (moduleSlug: string) =>
  GET(new Request('http://localhost/api/og'), { params: Promise.resolve({ username: 'ada', moduleSlug }) })

beforeEach(() => mocks.getPublicPortfolioData.mockReset())

describe('capstone OG card', () => {
  it('renders a 1200x630 PNG with the long cache for a public capstone', async () => {
    mocks.getPublicPortfolioData.mockResolvedValue(portfolio())
    const res = await get('discovery')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=3600, stale-while-revalidate=600')
  })

  it.each([
    ['an unknown capstone', () => portfolio(), 'strategy'],
    ['a private portfolio', () => portfolio(false), 'discovery'],
    ['a missing portfolio', () => null, 'discovery'],
  ])('falls back to the generic card (short cache) for %s', async (_label, data, slug) => {
    mocks.getPublicPortfolioData.mockResolvedValue(data())
    const res = await get(slug)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  })
})
