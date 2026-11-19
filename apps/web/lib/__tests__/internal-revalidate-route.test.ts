import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
  unstable_cache: (fn: unknown) => fn,
}))

const rateLimitResult = { success: true, allowed: true, remaining: 100, resetInMs: 0 }
vi.mock('@/lib/rate-limit', () => ({
  evaluateRateLimit: vi.fn(async () => rateLimitResult),
  evaluatePersistentRateLimit: vi.fn(async () => rateLimitResult),
}))

const { POST } = await import('@/app/api/internal/revalidate/route')
const { classifyRevalidatePath, REVALIDATABLE_TAGS } = await import('@/lib/internal/revalidate-allowlist')

const SECRET = 'test-internal-secret-value'
const URL_ = 'http://localhost:3000/api/internal/revalidate'

function post(body: unknown, auth: string | null = `Bearer ${SECRET}`): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth !== null) headers.authorization = auth
  return new Request(URL_, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  revalidateTag.mockClear()
  revalidatePath.mockClear()
  vi.stubEnv('INTERNAL_REVALIDATE_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/internal/revalidate: authentication', () => {
  it('refuses a request with no Authorization header with 401, before reading the body', async () => {
    const res = await POST(post({ tags: [{ tag: 'leaderboard' }] }, null))
    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()

    const bad = await POST(post('not json', null))
    expect(bad.status).toBe(401)
  })

  it('refuses a wrong secret and a non-bearer scheme with 401', async () => {
    expect((await POST(post({ tags: [{ tag: 'leaderboard' }] }, 'Bearer nope'))).status).toBe(401)
    expect((await POST(post({ tags: [{ tag: 'leaderboard' }] }, `Basic ${SECRET}`))).status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('fails closed in production when INTERNAL_REVALIDATE_SECRET is unset', async () => {
    vi.stubEnv('INTERNAL_REVALIDATE_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    const res = await POST(post({ tags: [{ tag: 'leaderboard' }] }, 'Bearer anything'))
    expect(res.status).toBe(401)
    const noHeader = await POST(post({ tags: [{ tag: 'leaderboard' }] }, null))
    expect(noHeader.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('lets a local admin app through without a secret only under development or test', async () => {
    vi.stubEnv('INTERNAL_REVALIDATE_SECRET', '')
    vi.stubEnv('NODE_ENV', 'development')
    const res = await POST(post({ tags: [{ tag: 'leaderboard' }] }, null))
    expect(res.status).toBe(200)
  })

  it('compares the secret in constant time through lib/security/constant-time', () => {
    const src = readFileSync(path.resolve(process.cwd(), 'app/api/internal/revalidate/route.ts'), 'utf8')
    expect(src).toContain("from '@/lib/security/constant-time'")
    expect(src).toContain('secretsMatch(provided, expected)')
    expect(src).not.toMatch(/provided\s*===\s*expected/)
  })
})

describe('POST /api/internal/revalidate: allowlist', () => {
  it.each([
    ['an admin tag', { tags: [{ tag: 'admin-dashboard' }] }],
    ['an unknown tag', { tags: [{ tag: 'anything' }] }],
    ['an admin path', { paths: ['/admin'] }],
    ['an admin subpath', { paths: ['/admin/moderation'] }],
    ['an absolute URL', { paths: ['https://evil.example/p/x'] }],
    ['a protocol-relative URL', { paths: ['//evil.example/p/x'] }],
    ['a traversal', { paths: ['/p/../admin'] }],
    ['a traversal inside a handle', { paths: ['/p/..'] }],
    ['a query string', { paths: ['/p/someone?x=1'] }],
    ['an encoded path', { paths: ['/p/%2e%2e'] }],
    ['an unlisted learner page', { paths: ['/settings'] }],
    ['/reviews (tag-driven, not a path)', { paths: ['/reviews'] }],
    ['a capstone module page', { paths: ['/capstones/product-strategy'] }],
    ['the badges tag', { tags: [{ tag: 'badges' }] }],
    ['an OG segment encoding a traversal', { paths: ['/api/og/portfolio/%2e%2e'] }],
    ['an OG segment encoding a slash', { paths: ['/api/og/portfolio/a%2Fb'] }],
    ['an OG segment with a bad escape', { paths: ['/api/og/portfolio/a%zz'] }],
    ['an OG double slash', { paths: ['/api/og/portfolio//x'] }],
    ['an empty body', {}],
    ['too many tags', { tags: Array.from({ length: 51 }, () => ({ tag: 'leaderboard' })) }],
    ['too many paths', { paths: Array.from({ length: 51 }, () => '/dashboard') }],
    ['a negative expire', { tags: [{ tag: 'leaderboard', expire: -1 }] }],
  ])('rejects %s with 400 and revalidates nothing', async (_label, body) => {
    const res = await POST(post(body))
    expect(res.status).toBe(400)
    expect(revalidateTag).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('rejects a body that is not JSON with 400', async () => {
    const res = await POST(post('{not json'))
    expect(res.status).toBe(400)
  })

  it('accepts the learner tags the admin console invalidates', () => {
    expect([...REVALIDATABLE_TAGS].sort()).toEqual(['leaderboard', 'system_settings', 'testimonials'])
  })

  it('keeps system_settings in step with SYSTEM_SETTINGS_TAG', async () => {
    const { SYSTEM_SETTINGS_TAG } = await import('@/lib/settings/system-settings-service')
    expect(REVALIDATABLE_TAGS).toContain(SYSTEM_SETTINGS_TAG)
  })

  it.each([
    ['/dashboard', 'layout'],
    ['/academy', 'layout'],
    ['/progress', 'layout'],
    ['/capstones', 'layout'],
    ['/p/jane_doe', 'page'],
    ['/p/Jane_Doe', 'page'],
    ['/p/jane_doe/capstones/product-strategy', 'page'],
    ['/api/og/portfolio/jane_doe', 'page'],
    ['/api/og/portfolio/jane_doe/capstones/product-strategy', 'page'],
    ['/api/og/portfolio/j%C3%A9r%C3%B4me', 'page'],
    ['/api/og/portfolio/jane.doe/capstones/product-strategy', 'page'],
  ])('classifies %s as %s', (p, kind) => {
    expect(classifyRevalidatePath(p)).toBe(kind)
  })
})

describe('POST /api/internal/revalidate: revalidation', () => {
  it('expires a tag at once for expire 0 and uses the max profile otherwise', async () => {
    const res = await POST(
      post({
        tags: [
          { tag: 'leaderboard', expire: 0 },
          { tag: 'system_settings' },
          { tag: 'testimonials', expire: 60 },
        ],
      })
    )
    expect(res.status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith('leaderboard', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith('system_settings', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('testimonials', 'max')
    expect(await res.json()).toEqual({
      revalidated: { tags: ['leaderboard', 'system_settings', 'testimonials'], paths: [] },
    })
  })

  it('revalidates section roots as layouts and per-learner paths as pages, once each', async () => {
    const res = await POST(
      post({
        paths: ['/dashboard', '/p/jane_doe', '/p/jane_doe', '/api/og/portfolio/jane_doe/capstones/product-strategy'],
      })
    )
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/p/jane_doe')
    expect(revalidatePath).toHaveBeenCalledWith('/api/og/portfolio/jane_doe/capstones/product-strategy')
    expect(revalidatePath).toHaveBeenCalledTimes(3)
    expect(await res.json()).toEqual({
      revalidated: {
        tags: [],
        paths: ['/dashboard', '/p/jane_doe', '/api/og/portfolio/jane_doe/capstones/product-strategy'],
      },
    })
  })
})

describe('internal revalidate wiring', () => {
  const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), 'utf8')

  it('is excluded from the proxy matcher and the same-origin check', () => {
    expect(read('proxy.ts')).toContain('|api/internal|')
    expect(read('lib/security/origin-check.ts')).toContain("'/api/internal/revalidate'")
  })
})
