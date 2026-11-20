/**
 * Perf plan item 13: the public portfolio is cached (ISR) and purged by path.
 *
 * Pins the four parts that make that safe and cheap:
 *  - the lookup is an exact, indexed username match over named columns, and the remaining reads
 *    run together with lesson progress read once;
 *  - nothing is written during render: views are counted by a rate-limited client beacon route;
 *  - both public pages are ISR (revalidate 3600, dynamicParams, no prerendered params);
 *  - every write that changes what the pages show purges the exact /p paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { CAPSTONE_DEFINITIONS } from '@/config/capstones'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  client: null as unknown,
  updatePortfolioSettings: vi.fn(),
  submitCapstoneAction: vi.fn(),
  recordReflectionAction: vi.fn(),
  verifyDestructiveReauth: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  revalidateTag: mocks.revalidateTag,
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ createServiceRoleClient: () => mocks.client }))
// The route wrapper is not under test: hand the handler straight back.
vi.mock('@/lib/api/with-route', () => ({
  withRoute: (_config: unknown, handler: unknown) => handler,
  RouteError: class RouteError extends Error {},
}))
vi.mock('@/lib/api/actor', () => ({
  requireUserId: () => 'u1',
}))
vi.mock('@/lib/capstones-db', () => ({ submitCapstoneAction: mocks.submitCapstoneAction }))
vi.mock('@/lib/xp-service', () => ({ hasXpEvent: vi.fn(async () => false) }))
vi.mock('@/lib/badges/evaluate-after-xp', () => ({ evaluateBadgesAfterXp: vi.fn() }))
vi.mock('@/lib/events/product-events', () => ({ trackProductEvent: vi.fn() }))
vi.mock('@/lib/lessons-db', () => ({ recordReflectionAction: mocks.recordReflectionAction }))
vi.mock('@/lib/settings/destructive-reauth', () => ({ verifyDestructiveReauth: mocks.verifyDestructiveReauth }))
vi.mock('@/lib/settings/settings-service', () => ({ deleteAccount: mocks.deleteAccount, resetProgress: vi.fn() }))
vi.mock('@/lib/monitoring/logger', () => ({ logSystemError: vi.fn(), logErrorReport: vi.fn() }))

type Op = [string, unknown[]]
interface QueryLog {
  table: string
  ops: Op[]
}

/**
 * A chainable Supabase fake. Every builder call is logged; awaiting the chain resolves to
 * `results[table]` (or a per-chain override). With `gate`, reads of every table except `users`
 * wait until `release()` is called, which shows whether they were all issued before any finished.
 */
function fakeClient(results: Record<string, { data: unknown; error?: unknown }>, gate = false) {
  const log: QueryLog[] = []
  const pending: Array<() => void> = []
  const client = {
    from(table: string) {
      const entry: QueryLog = { table, ops: [] }
      log.push(entry)
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => {
                const result = { error: null, ...(results[table] ?? { data: null }) }
                if (gate && table !== 'users') pending.push(() => resolve(result))
                else resolve(result)
              }
            }
            return (...args: unknown[]) => {
              entry.ops.push([prop, args])
              if (prop === 'maybeSingle' || prop === 'single') {
                const rows = results[table]?.data
                const row = Array.isArray(rows) ? rows[0] ?? null : rows ?? null
                return Promise.resolve({ data: row, error: results[table]?.error ?? null })
              }
              return chain
            }
          },
        }
      )
      return chain
    },
    auth: { admin: { deleteUser: vi.fn(async () => ({ data: null, error: null })) } },
  }
  return {
    client,
    log,
    release: () => pending.splice(0).forEach((go) => go()),
    pendingCount: () => pending.length,
  }
}

const PUBLIC_USER = {
  id: 'u1',
  username: 'ada',
  name: 'Ada',
  bio: null,
  avatar_url: null,
  linkedin_url: null,
  github_url: null,
  website_url: null,
  current_streak: 2,
  longest_streak: 5,
  total_xp: 900,
  is_fellow: false,
  is_portfolio_public: true,
  portfolio_layout: null,
  featured_capstone_id: null,
  portfolio_view_count: 3,
  portfolio_verification_override: null,
}

const SLUGS = Object.keys(CAPSTONE_DEFINITIONS)
const purged = () => mocks.revalidatePath.mock.calls.map(([path]) => path as string)
const allPagesOf = (handle: string) => [`/p/${handle}`, ...SLUGS.map((slug) => `/p/${handle}/capstones/${slug}`)]

beforeEach(() => {
  for (const fn of [
    mocks.revalidatePath,
    mocks.revalidateTag,
    mocks.updatePortfolioSettings,
    mocks.submitCapstoneAction,
    mocks.recordReflectionAction,
    mocks.verifyDestructiveReauth,
    mocks.deleteAccount,
  ]) {
    fn.mockReset()
  }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('public portfolio read', () => {
  it('matches the lowercased username exactly, over named columns, never ILIKE or select *', async () => {
    const { getPublicPortfolioData } = await import('../portfolio-db')
    const fake = fakeClient({ users: { data: [PUBLIC_USER] } })

    await getPublicPortfolioData(fake.client as never, '  Ada ')

    const users = fake.log.find((q) => q.table === 'users')!
    expect(users.ops).toContainEqual(['eq', ['username', 'ada']])
    expect(users.ops.some(([op]) => op === 'ilike')).toBe(false)
    const [, [columns]] = users.ops.find(([op]) => op === 'select')!
    expect(columns).not.toBe('*')
    expect(String(columns)).toContain('is_portfolio_public')
  })

  it('issues the progress, capstone and reflection reads together, and reads progress once', async () => {
    const { getPublicPortfolioData } = await import('../portfolio-db')
    const fake = fakeClient(
      {
        users: { data: [PUBLIC_USER] },
        user_lesson_progress: {
          data: [
            { lesson_id: 'l1', status: 'completed', quiz_score: 90, quiz_attempts: 1 },
            { lesson_id: 'l2', status: 'in_progress', quiz_score: null, quiz_attempts: 0 },
          ],
        },
        capstone_submissions: { data: [] },
        reflections: { data: [] },
      },
      true
    )

    const pending = getPublicPortfolioData(fake.client as never, 'ada')
    await new Promise((resolve) => setTimeout(resolve, 0))

    // All three were issued before any of them finished.
    expect(fake.pendingCount()).toBe(3)
    fake.release()
    const payload = await pending

    expect(fake.log.filter((q) => q.table === 'user_lesson_progress')).toHaveLength(1)
    expect(payload?.progress.completedLessonsCount).toBe(1)
    expect(fake.log.map((q) => q.table).sort()).toEqual(
      ['capstone_submissions', 'reflections', 'user_lesson_progress', 'users'].sort()
    )
  })

  it('resolves a private portfolio to null without reading anything else', async () => {
    const { getPublicPortfolioData } = await import('../portfolio-db')
    const fake = fakeClient({ users: { data: [{ ...PUBLIC_USER, is_portfolio_public: false }] } })

    expect(await getPublicPortfolioData(fake.client as never, 'ada')).toBeNull()
    expect(fake.log.map((q) => q.table)).toEqual(['users'])
  })

  it('performs no write, so the cached render cannot count or change anything', () => {
    const src = readFileSync(new URL('../portfolio-db.ts', import.meta.url), 'utf-8')
    const body = src.slice(
      src.indexOf('export async function getPublicPortfolioData'),
      src.indexOf('export const getDedupedPublicPortfolioData')
    )
    for (const write of ['.insert(', '.update(', '.upsert(', '.delete(', '.rpc(', 'increment']) {
      expect(body).not.toContain(write)
    }
  })
})

describe('public portfolio pages are ISR', () => {
  it.each([
    ['portfolio', '../../app/(portfolio)/p/[username]/page'],
    ['capstone', '../../app/(portfolio)/p/[username]/capstones/[moduleSlug]/page'],
  ])('the %s page caches for an hour and prerenders nothing at build', async (_name, path) => {
    const mod = (await import(path)) as {
      revalidate?: number
      dynamic?: string
      dynamicParams?: boolean
      generateStaticParams?: () => Promise<unknown[]>
    }
    expect(mod.revalidate).toBe(3600)
    expect(mod.dynamic).toBeUndefined()
    expect(mod.dynamicParams).toBe(true)
    await expect(mod.generateStaticParams!()).resolves.toEqual([])
  })

  it('the portfolio page writes nothing during render and leaves counting to the beacon', () => {
    const page = readFileSync(new URL('../../app/(portfolio)/p/[username]/page.tsx', import.meta.url), 'utf-8')
    expect(page).not.toContain('incrementPortfolioViewCount')
    expect(page).not.toContain('createServiceRoleClient')
    expect(page).toContain('<PortfolioViewBeacon username={user.username} />')
  })
})

describe('POST /api/portfolio/[username]/view', () => {
  const view = async (username: string, ip = '203.0.113.7') => {
    const { POST } = await import('../../app/api/portfolio/[username]/view/route')
    const handler = POST as unknown as (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>
    return handler({
      request: new Request(`https://prodily.app/api/portfolio/${username}/view`, {
        method: 'POST',
        headers: { 'x-real-ip': ip, 'x-forwarded-for': ip },
      }),
      params: { username },
    })
  }

  it('counts a public view once per visitor per window, and always answers 204', async () => {
    const fake = fakeClient({ users: { data: { id: 'u1' } } })
    mocks.client = fake.client
    const rpc = vi.fn(async () => ({ error: null }))
    ;(fake.client as unknown as { rpc: typeof rpc }).rpc = rpc

    const first = await view('counted-once')
    const second = await view('counted-once')

    expect(first.status).toBe(204)
    expect(second.status).toBe(204)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('increment_portfolio_view_count', { target_user_id: 'u1' })
    const lookup = fake.log.find((q) => q.table === 'users')!
    expect(lookup.ops).toContainEqual(['eq', ['username', 'counted-once']])
    expect(lookup.ops).toContainEqual(['eq', ['is_portfolio_public', true]])
  })

  it('does not count a private or unknown portfolio, and answers the same 204', async () => {
    const fake = fakeClient({ users: { data: null } })
    mocks.client = fake.client
    const rpc = vi.fn(async () => ({ error: null }))
    ;(fake.client as unknown as { rpc: typeof rpc }).rpc = rpc

    const res = await view('private-one')

    expect(res.status).toBe(204)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('ignores a username that cannot exist without touching the database', async () => {
    const fake = fakeClient({})
    mocks.client = fake.client

    const res = await view('not a handle!')

    expect(res.status).toBe(204)
    expect(fake.log).toHaveLength(0)
  })
})

describe('writes purge the cached public pages', () => {
  it('lists the portfolio and every capstone page under the lowercase handle', async () => {
    const { publicPortfolioPaths, revalidatePublicPortfolio } = await import('../portfolio-revalidate')
    expect(publicPortfolioPaths(' Ada ')).toEqual(allPagesOf('ada'))
    revalidatePublicPortfolio(null)
    revalidatePublicPortfolio('')
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('never lets a failed purge escape', async () => {
    const { revalidatePublicPortfolio } = await import('../portfolio-revalidate')
    mocks.revalidatePath.mockImplementation(() => {
      throw new Error('outside a request')
    })
    expect(() => revalidatePublicPortfolio('ada')).not.toThrow()
  })

  it('portfolio settings save: purges both the old and the new handle, and the leaderboard', async () => {
    mocks.updatePortfolioSettings.mockResolvedValue({
      success: true,
      previousUsername: 'ada',
      settings: { username: 'ada-new' },
    })
    vi.doMock('@/lib/portfolio-db', async (importOriginal) => ({
      ...(await importOriginal<typeof import('../portfolio-db')>()),
      updatePortfolioSettings: mocks.updatePortfolioSettings,
    }))
    vi.resetModules()
    const { POST } = await import('../../app/api/settings/portfolio/route')
    // The body is a declared schema now, so the (mocked-away) wrapper hands it over parsed.
    const handler = POST as unknown as (ctx: { actor: unknown; body: unknown }) => Promise<Response>

    const res = await handler({
      body: { username: 'ada-new', isPortfolioPublic: false },
      actor: { kind: 'learner', userId: 'u1' },
    })

    expect(res.status).toBe(200)
    for (const path of [...allPagesOf('ada'), ...allPagesOf('ada-new')]) {
      expect(purged()).toContain(path)
    }
    expect(mocks.revalidateTag).toHaveBeenCalledWith('leaderboard', 'max')
    vi.doUnmock('@/lib/portfolio-db')
  })

  it('profile save: purges the learner portfolio and the leaderboard', async () => {
    mocks.client = fakeClient({ users: { data: { username: 'ada' } } }).client
    const { POST } = await import('../../app/api/settings/profile/route')
    const handler = POST as unknown as (ctx: { actor: unknown; body: unknown }) => Promise<Response>

    const res = await handler({ actor: { kind: 'learner', userId: 'u1' }, body: { name: 'Ada L' } })

    expect(res.status).toBe(200)
    expect(purged()).toEqual(expect.arrayContaining(allPagesOf('ada')))
    expect(mocks.revalidateTag).toHaveBeenCalledWith('leaderboard', 'max')
  })

  it('capstone submit: purges the portfolio and that capstone page', async () => {
    mocks.client = fakeClient({ users: { data: { username: 'ada' } }, capstone_submissions: { data: null } }).client
    mocks.submitCapstoneAction.mockResolvedValue({ submission: {}, xpEarned: 0, message: 'ok' })
    const { POST } = await import('../../app/api/capstones/[module]/submit/route')
    const handler = POST as unknown as (ctx: { actor: unknown; body: unknown; params: Record<string, string> }) => Promise<Response>

    const res = await handler({
      actor: { kind: 'learner', userId: 'u1' },
      body: { content: 'x' },
      params: { module: 'discovery' },
    })

    expect(res.status).toBe(200)
    expect(purged()).toEqual(expect.arrayContaining(['/p/ada', '/p/ada/capstones/discovery']))
  })

  it('reflections: a capstone reflection purges its capstone page, a lesson reflection does not', async () => {
    mocks.client = fakeClient({ users: { data: { username: 'ada' } } }).client
    mocks.recordReflectionAction.mockResolvedValue({ success: true })
    const { POST } = await import('../../app/api/reflections/route')
    // The body is a declared schema now, so the (mocked-away) wrapper hands it over parsed.
    const handler = POST as unknown as (ctx: { actor: unknown; body: unknown }) => Promise<Response>
    const post = (lesson_id: string) =>
      handler({
        body: { lesson_id, content: 'thoughts', is_public: true },
        actor: { kind: 'learner', userId: 'u1' },
      })

    await post('les_000001')
    expect(purged().filter((p) => p.startsWith('/p/'))).toEqual([])

    await post('capstone-discovery')
    expect(purged()).toEqual(['/p/ada', '/p/ada/capstones/discovery'])
  })

  it('reflections (L9): content over 10,000 characters is refused before any write', async () => {
    // The ceiling lives in the declared body schema, which the wrapper applies before
    // the handler runs (the wrapper is mocked away in this file).
    const { reflectionWriteBodySchema } = await import('../api/contracts/learner-writes')
    const parsed = reflectionWriteBodySchema.safeParse({ lesson_id: 'les_000001', content: 'x'.repeat(10_001) })
    expect(parsed.success).toBe(false)
    expect(readFileSync(path.join(process.cwd(), 'app/api/reflections/route.ts'), 'utf8')).toContain(
      'body: reflectionWriteBodySchema'
    )
  })

  it('account deletion: purges the deleted learner pages and expires the leaderboard', async () => {
    const fake = fakeClient({ users: { data: { username: 'ada' } } })
    mocks.client = fake.client
    mocks.verifyDestructiveReauth.mockResolvedValue({ ok: true })
    mocks.deleteAccount.mockResolvedValue(undefined)
    const { POST } = await import('../../app/api/settings/delete-account/route')
    const handler = POST as unknown as (ctx: { request: Request; actor: unknown }) => Promise<Response>

    const res = await handler({
      request: new Request('https://prodily.app/api/settings/delete-account', {
        method: 'POST',
        body: JSON.stringify({ confirmation: 'DELETE' }),
      }),
      actor: { kind: 'learner', userId: 'u1' },
    })

    expect(res.status).toBe(200)
    expect(fake.client.auth.admin.deleteUser).toHaveBeenCalledWith('u1')
    expect(purged()).toEqual(expect.arrayContaining(allPagesOf('ada')))
    expect(mocks.revalidateTag).toHaveBeenCalledWith('leaderboard', { expire: 0 })
  })
})
