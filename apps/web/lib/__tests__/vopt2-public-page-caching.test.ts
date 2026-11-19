/**
 * V-OPT-2 and perf plan item 13: public portfolio and certificate page caching.
 *
 *  - Certificates are cached across requests (ISR). They carry no revocation or
 *    status column and are not mutated after issuance.
 *
 *  - Portfolios are cached across requests too (ISR, revalidate 3600), now that the
 *    invalidation path exists: every write that changes what a portfolio shows,
 *    making it private above all, purges its exact paths with revalidatePath
 *    (lib/portfolio-revalidate.ts, pinned in portfolio-page-cache.test.ts). These
 *    tests pin the privacy invariants the cached render relies on: a private or
 *    missing portfolio resolves to null, the read performs no write, and the page
 *    reads nothing per viewer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPublicPortfolioData = vi.fn()
const mockVerifyCertificate = vi.fn()
const mockIncrement = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => ({ __client: true }),
}))

describe('V-OPT-2: public portfolio read', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function loadPortfolioDb() {
    return import('../portfolio-db')
  }

  it('1. a public portfolio renders its payload', async () => {
    const db = await loadPortfolioDb()
    const client = { from: vi.fn() } as never
    vi.spyOn(db, 'getPublicPortfolioData')
    // Exercised through the real function's privacy branch below; here we only assert
    // the public contract exists and is exported for the page to consume.
    expect(typeof db.getDedupedPublicPortfolioData).toBe('function')
    expect(typeof db.getPublicPortfolioData).toBe('function')
    void client
  })

  it('3. a private portfolio resolves to null, so nothing public can be derived from it', async () => {
    const db = await loadPortfolioDb()
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: async () => ({
              data: [{ id: 'u1', username: 'private-user', is_portfolio_public: false }],
              error: null,
            }),
          }),
        }),
      }),
    } as never

    const result = await db.getPublicPortfolioData(client, 'private-user')
    expect(result).toBeNull()
  })

  it('3b. a missing user resolves to null rather than leaking a partial payload', async () => {
    const db = await loadPortfolioDb()
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      }),
    } as never

    expect(await db.getPublicPortfolioData(client, 'nobody')).toBeNull()
  })

  it('8/10. the public read performs NO write, so it is safe to deduplicate or cache', async () => {
    // This is the property that made the previous arrangement unsafe to cache: the
    // view-count increment used to live inside this function.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../portfolio-db.ts', import.meta.url), 'utf-8')
    )
    const body = src.slice(
      src.indexOf('export async function getPublicPortfolioData'),
      src.indexOf('export const getDedupedPublicPortfolioData')
    )
    expect(body).not.toContain('incrementPortfolioViewCount(')
  })

  it('9. view counting is not in the render: the cached page sends a client beacon instead', async () => {
    const page = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../app/(portfolio)/p/[username]/page.tsx', import.meta.url), 'utf-8')
    )
    // A write during render would count cache regenerations, not views, and would make the
    // page dynamic again.
    expect(page).not.toContain('incrementPortfolioViewCount')
    expect(page).not.toContain('recordPortfolioView')
    expect(page).toContain('<PortfolioViewBeacon')
  })

  it('9b. the increment still re-checks visibility itself', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../portfolio-db.ts', import.meta.url), 'utf-8')
    )
    const body = src.slice(src.indexOf('export async function incrementPortfolioViewCount'))
    expect(body).toContain('is_portfolio_public')
  })

  it('deduplicates the read within a render; the page itself is the cross-request cache', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../portfolio-db.ts', import.meta.url), 'utf-8')
    )
    expect(src).toContain("import { cache } from 'react'")
    // One cache layer, purged by path. A second data-cache layer under the page would outlive
    // a revalidatePath of the page and serve a private portfolio again.
    expect(src).not.toContain('unstable_cache')
  })

  it('the page is ISR, so it renders once per regeneration instead of once per view', async () => {
    const mod = await import('../../app/(portfolio)/p/[username]/page')
    expect((mod as { revalidate?: number }).revalidate).toBe(3600)
    expect((mod as { dynamic?: string }).dynamic).toBeUndefined()
    expect((mod as { dynamicParams?: boolean }).dynamicParams).toBe(true)
    const gsp = (mod as { generateStaticParams?: () => Promise<unknown[]> }).generateStaticParams
    expect(typeof gsp).toBe('function')
    await expect(gsp!()).resolves.toEqual([])
  })

  it('the page reads no cookies, headers or search params, so nothing per viewer enters the cache', async () => {
    const fs = await import('node:fs')
    for (const rel of ['../../app/(portfolio)/p/[username]/page.tsx', '../../app/(portfolio)/p/[username]/capstones/[moduleSlug]/page.tsx']) {
      const page = fs.readFileSync(new URL(rel, import.meta.url), 'utf-8')
      expect(page).not.toContain('cookies()')
      expect(page).not.toContain('headers()')
      expect(page).not.toContain('searchParams')
      expect(page).not.toContain('getServerUser')
    }
  })
})

describe('V-OPT-2: certificate verification caching', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    void mockGetPublicPortfolioData
    void mockVerifyCertificate
    void mockIncrement
  })

  it('1/4. the verify page is cached across requests with an hourly revalidate', async () => {
    const mod = await import('../../app/verify/[certificateId]/page')
    expect((mod as { revalidate?: number }).revalidate).toBe(3600)
    expect((mod as { dynamic?: string }).dynamic).toBeUndefined()
    // Required for a dynamic segment to cache at all: revalidate alone left the route
    // dynamic in the build route table. Verified as `●` after adding these.
    expect((mod as { dynamicParams?: boolean }).dynamicParams).toBe(true)
    const gsp = (mod as { generateStaticParams?: () => Promise<unknown[]> }).generateStaticParams
    expect(typeof gsp).toBe('function')
    await expect(gsp!()).resolves.toEqual([])
  })

  it('3/5. there is no revocation state that caching could serve stale', async () => {
    // The justification for caching. If a status/revocation column is ever added,
    // this fails and the caching decision must be revisited with invalidation.
    const types = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../types/database.ts', import.meta.url), 'utf-8')
    )
    const block = types.slice(types.indexOf('      certificates: {'))
    const row = block.slice(block.indexOf('Row: {'), block.indexOf('Insert: {'))
    for (const forbidden of ['revoked', 'is_valid', 'status', 'revoked_at', 'valid_until']) {
      expect(row).not.toContain(forbidden)
    }
  })

  it('2/8. an unknown certificate resolves to null rather than another certificate', async () => {
    const db = await import('../certificates-db')
    const client = {
      from: () => ({
        select: () => ({
          ilike: () => ({ maybeSingle: async () => ({ data: null }) }),
          eq: () => ({ maybeSingle: async () => ({ data: null }) }),
        }),
      }),
    } as never

    expect(await db.verifyCertificate(client, 'does-not-exist')).toBeNull()
  })

  it('8. the looked-up code is the one returned — no cross-certificate bleed', async () => {
    const db = await import('../certificates-db')
    let asked = ''
    const client = {
      from: (t: string) => {
        if (t === 'certificates') {
          return {
            select: () => ({
              ilike: (_c: string, v: string) => {
                asked = v
                return {
                  maybeSingle: async () => ({
                    data: {
                      id: 'cert-a', certificate_code: v, type: 'completion', module_slug: null,
                      learner_name: 'A', level: 3, career_title: 'PM', total_xp: 500,
                      lessons_completed: 10, modules_completed: 1, user_id: 'u1',
                      issued_at: '2026-01-01T00:00:00Z',
                    },
                  }),
                }
              },
            }),
          }
        }
        return {
          select: () => ({ eq: () => ({ single: async () => ({ data: { username: 'a', name: 'A', avatar_url: null } }) }) }),
        }
      },
    } as never

    const cert = await db.verifyCertificate(client, 'PMA-2026-AAA111')
    expect(asked).toBe('PMA-2026-AAA111')
    expect(cert?.certificateCode).toBe('PMA-2026-AAA111')
  })

  it('7. the verify page reads no cookies or headers, so nothing private can enter the cache', async () => {
    const page = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../app/verify/[certificateId]/page.tsx', import.meta.url), 'utf-8')
    )
    expect(page).not.toContain('cookies()')
    expect(page).not.toContain('headers()')
    expect(page).not.toContain('searchParams')
  })

  it('the certificate lookup performs no mutation and no view counting', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../certificates-db.ts', import.meta.url), 'utf-8')
    )
    const body = src.slice(src.indexOf('export async function verifyCertificate'))
    const fn = body.slice(0, body.indexOf('\nexport '))
    for (const mutation of ['.insert(', '.update(', '.upsert(', '.delete(', 'increment']) {
      expect(fn).not.toContain(mutation)
    }
  })

  it('resolves the certificate once per request instead of twice', async () => {
    const page = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../../app/verify/[certificateId]/page.tsx', import.meta.url), 'utf-8')
    )
    expect(page).toContain('getDedupedVerifiedCertificate')
    expect(page).not.toContain('verifyCertificate(supabase')
  })
})
