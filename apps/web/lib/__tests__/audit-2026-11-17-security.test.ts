/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Code audit 2026-11-17, findings #1, #4, #10, #14 and #15.
 *
 * - #1  /api/portfolio/share: learners only, rate limited per user.
 * - #4  /verify/<code>: `%`, `_` and prefixes never resolve a certificate.
 * - #10 username lookups: `_` matches only a literal underscore.
 * - #14 admin search: a comma in the query stays inside one quoted value.
 * - #15 avatar upload: the stored type comes from the file bytes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  authUser: null as { id: string; email: string } | null,
  isAdmin: false,
  buckets: new Map<string, number>(),
  trackProductEvent: vi.fn(async () => undefined),
  uploadAvatar: vi.fn(async (params: { mimeType: string }) => ({
    success: true,
    avatarUrl: `https://x.supabase.co/storage/v1/object/public/avatars/u/a.${params.mimeType.split('/')[1]}`,
    storagePath: 'u/a',
  })),
  serviceDb: null as any,
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async (key: string, opts: { limit: number; windowMs: number }) => {
    const used = (mocks.buckets.get(key) ?? 0) + 1
    mocks.buckets.set(key, used)
    return { success: used <= opts.limit, remaining: Math.max(0, opts.limit - used), resetInMs: opts.windowMs }
  }),
}))
vi.mock('@/lib/monitoring/logger', () => ({
  logSystemError: vi.fn(async () => 'err_1'),
  logErrorReport: vi.fn(async () => undefined),
}))
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, getAuthenticatedUserFromRequest: vi.fn(async () => mocks.authUser) }
})
vi.mock('@/lib/admin/guard', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    requireAdminUser: vi.fn(async () =>
      mocks.isAdmin
        ? { authorized: true, userId: 'admin-1', email: 'admin@example.com' }
        : { authorized: false, statusCode: 401, error: 'no' }
    ),
    logAdminAction: vi.fn(),
  }
})
vi.mock('@/lib/events/product-events', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, trackProductEvent: mocks.trackProductEvent }
})
vi.mock('@/lib/avatar/avatar-service', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    AvatarService: { ...actual.AvatarService, uploadAndSetUserAvatar: mocks.uploadAvatar },
  }
})
vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, createServiceRoleClient: () => mocks.serviceDb }
})
vi.mock('@/lib/lesson-loader', () => ({ fetchCurriculumData: vi.fn(async () => ({ lessons: [] })) }))

import { escapeLike } from '@/lib/db/escape-like'
import { verifyCertificate } from '@/lib/certificates-db'
import { resolveReferralCode } from '@/lib/referral/referral-service'
import { updatePortfolioSettings } from '@/lib/portfolio-db'
import { POST as sharePOST } from '@/app/api/portfolio/share/route'
import { POST as avatarPOST } from '@/app/api/user/avatar/route'
import { GET as adminSearchGET } from '@/app/api/admin/search/route'

// ─── A fake table store with real LIKE semantics ─────────────────────────────

/** Postgres ILIKE with `\` as escape, plus PostgREST's `*` to `%` rewrite. */
function ilikeMatches(value: string, pattern: string): boolean {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\' && i + 1 < pattern.length) {
      re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (c === '%' || c === '*') re += '[\\s\\S]*'
    else if (c === '_') re += '[\\s\\S]'
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, 'i').test(value)
}

function fakeDb(tables: Record<string, Array<Record<string, any>>>) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const chain: any = {
        select: () => chain,
        ilike: (col: string, pattern: string) => {
          rows = rows.filter((r) => typeof r[col] === 'string' && ilikeMatches(r[col], pattern))
          return chain
        },
        eq: (col: string, v: unknown) => {
          rows = rows.filter((r) => r[col] === v)
          return chain
        },
        neq: (col: string, v: unknown) => {
          rows = rows.filter((r) => r[col] !== v)
          return chain
        },
        limit: (n: number) => {
          rows = rows.slice(0, n)
          return chain
        },
        update: () => ({ eq: async () => ({ error: null }) }),
        // PostgREST maybeSingle: more than one row is an error and no data.
        maybeSingle: async () =>
          rows.length > 1 ? { data: null, error: { message: 'multiple rows' } } : { data: rows[0] ?? null, error: null },
        single: async () => ({ data: rows[0] ?? null, error: rows.length === 1 ? null : { message: 'not one row' } }),
        then: (resolve: any) => resolve({ data: rows, error: null }),
      }
      return chain
    },
  } as any
}

beforeEach(() => {
  mocks.authUser = null
  mocks.isAdmin = false
  mocks.buckets.clear()
  mocks.trackProductEvent.mockClear()
  mocks.uploadAvatar.mockClear()
})

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character, and neutralises PostgREST *', () => {
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    expect(escapeLike('*')).toBe(' ')
    expect(escapeLike('PRD-ABC123')).toBe('PRD-ABC123')
  })
})

// ─── #4 certificate verification ─────────────────────────────────────────────

describe('#4 /verify does not accept wildcards', () => {
  const CERT = {
    id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    certificate_code: 'PRD-ABC123',
    learner_name: 'Jane',
    career_title: 'PM',
    type: 'career',
    module_slug: null,
    level: 3,
    total_xp: 500,
    lessons_completed: 10,
    modules_completed: 2,
    issued_at: '2026-01-01T00:00:00Z',
  }
  const db = () =>
    fakeDb({
      certificates: [CERT],
      users: [{ id: CERT.user_id, username: 'jane', name: 'Jane', avatar_url: null }],
    })

  it.each(['%', 'PRD-A%', 'PRD-ABC12_', '*', 'PRD-*'])('%j resolves to not found', async (code) => {
    expect(await verifyCertificate(db(), code)).toBeNull()
  })

  it('a real code still verifies, case-insensitively', async () => {
    const result = await verifyCertificate(db(), ' prd-abc123 ')
    expect(result?.certificateCode).toBe('PRD-ABC123')
    expect(result?.username).toBe('jane')
  })
})

// ─── #10 username lookups ────────────────────────────────────────────────────

describe('#10 usernames with _ match exactly', () => {
  it('the referral lookup resolves john_doe even when johnxdoe exists', async () => {
    const db = fakeDb({
      users: [
        { id: 'u-x', username: 'johnxdoe', name: 'X' },
        { id: 'u-real', username: 'john_doe', name: 'Real' },
      ],
    })
    expect((await resolveReferralCode(db, '@john_doe'))?.id).toBe('u-real')
  })

  it('the referral lookup does not resolve john_doe to johnxdoe', async () => {
    const db = fakeDb({ users: [{ id: 'u-x', username: 'johnxdoe', name: 'X' }] })
    expect(await resolveReferralCode(db, 'john_doe')).toBeNull()
  })

  const SETTINGS = {
    username: 'john_doe',
    name: 'John',
    bio: '',
    avatarUrl: '',
    linkedinUrl: '',
    githubUrl: '',
    websiteUrl: '',
    isPortfolioPublic: false,
  } as any

  it('saving john_doe is allowed when only johnxdoe is taken', async () => {
    const db = fakeDb({
      users: [
        { id: 'me', username: 'old' },
        { id: 'other', username: 'johnxdoe' },
      ],
    })
    const result = await updatePortfolioSettings(db, 'me', SETTINGS)
    expect(result.settings.username).toBe('john_doe')
  })

  it('saving john_doe is refused when john_doe is really taken', async () => {
    const db = fakeDb({
      users: [
        { id: 'me', username: 'old' },
        { id: 'other', username: 'john_doe' },
      ],
    })
    await expect(updatePortfolioSettings(db, 'me', SETTINGS)).rejects.toThrow(/already taken/)
  })
})

// ─── #1 share route ──────────────────────────────────────────────────────────

function shareRequest() {
  return new NextRequest('http://localhost:3000/api/portfolio/share', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context: 'portfolio', username: 'jane', channel: 'copy' }),
  })
}

describe('#1 /api/portfolio/share', () => {
  it('rejects anonymous callers and writes no event', async () => {
    const res = await sharePOST(shareRequest())
    expect(res.status).toBe(401)
    expect(mocks.trackProductEvent).not.toHaveBeenCalled()
  })

  it('records the event for a signed-in learner, attributed to them', async () => {
    mocks.authUser = { id: 'learner-1', email: 'l@example.com' }
    const res = await sharePOST(shareRequest())
    expect(res.status).toBe(200)
    expect(mocks.trackProductEvent).toHaveBeenCalledWith('portfolio_shared', 'learner-1', {
      context: 'portfolio',
      username: 'jane',
      channel: 'copy',
    })
  })

  it('rate limits a learner after 20 shares an hour', async () => {
    mocks.authUser = { id: 'learner-2', email: 'l2@example.com' }
    for (let i = 0; i < 20; i++) {
      expect((await sharePOST(shareRequest())).status).toBe(200)
    }
    expect((await sharePOST(shareRequest())).status).toBe(429)
    expect(mocks.trackProductEvent).toHaveBeenCalledTimes(20)
  })
})

// ─── #14 admin search ────────────────────────────────────────────────────────

describe('#14 admin search with a comma', () => {
  it('keeps "Smith, John" as one quoted value per column and returns the match', async () => {
    mocks.isAdmin = true
    const orFilters: string[] = []
    mocks.serviceDb = {
      from(table: string) {
        const chain: any = {
          select: () => chain,
          or: (filter: string) => {
            orFilters.push(filter)
            return chain
          },
          limit: async () => ({
            data:
              table === 'users'
                ? [{ id: 'u1', name: 'Smith, John', email: 'js@example.com', username: 'js', is_admin: false }]
                : [],
            error: null,
          }),
        }
        return chain
      },
    }

    const res = await adminSearchGET(new NextRequest('http://localhost:3000/api/admin/search?q=Smith%2C%20John'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.results.users).toHaveLength(1)
    expect(orFilters).toContain(
      'name.ilike."%Smith, John%",email.ilike."%Smith, John%",username.ilike."%Smith, John%"'
    )
    // No raw, unquoted term left in any filter.
    for (const filter of orFilters) expect(filter).not.toMatch(/ilike\.%/)
  })
})

// ─── #15 avatar upload ───────────────────────────────────────────────────────

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50])
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>')

function avatarRequest(bytes: Uint8Array, type: string) {
  const form = new FormData()
  form.append('file', new File([bytes as BlobPart], 'avatar', { type }))
  return new NextRequest('http://localhost:3000/api/user/avatar', { method: 'POST', body: form })
}

describe('#15 avatar upload checks the file bytes', () => {
  beforeEach(() => {
    mocks.authUser = { id: 'learner-3', email: 'l3@example.com' }
  })

  it('rejects a non-image sent as image/png', async () => {
    const res = await avatarPOST(avatarRequest(HTML, 'image/png'))
    expect(res.status).toBe(400)
    expect(mocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it('rejects a JPEG that claims to be a PNG', async () => {
    const res = await avatarPOST(avatarRequest(JPEG, 'image/png'))
    expect(res.status).toBe(400)
    expect(mocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it('rejects a base64 JSON upload whose bytes are not an image', async () => {
    const req = new NextRequest('http://localhost:3000/api/user/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64: Buffer.from(HTML).toString('base64'), mimeType: 'image/png' }),
    })
    expect((await avatarPOST(req)).status).toBe(400)
    expect(mocks.uploadAvatar).not.toHaveBeenCalled()
  })

  it.each([
    [PNG, 'image/png', 'image/png'],
    [JPEG, 'image/jpeg', 'image/jpeg'],
    [JPEG, 'image/jpg', 'image/jpeg'],
    [WEBP, 'image/webp', 'image/webp'],
  ])('accepts a real image and stores the sniffed type (%#)', async (bytes, declared, stored) => {
    const res = await avatarPOST(avatarRequest(bytes, declared))
    expect(res.status).toBe(200)
    expect(mocks.uploadAvatar).toHaveBeenCalledWith(expect.objectContaining({ mimeType: stored }))
  })
})
