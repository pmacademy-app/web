/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ─── Mocks ───────────────────────────────────────────────────────────────────

const unstableCacheCalls: Array<{ keyParts: unknown; options: unknown }> = []
const revalidateTag = vi.fn()

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: (...a: unknown[]) => unknown, keyParts: unknown, options: unknown) => {
    unstableCacheCalls.push({ keyParts, options })
    return fn
  }),
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  revalidatePath: vi.fn(),
}))

const requireAdminUser = vi.fn()
vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

const fromCalls: string[] = []
let countErrors: Record<string, unknown> = {}
let clientThrows = false
const COUNTS: Record<string, number> = {
  contact_messages: 2,
  testimonials: 3,
  system_errors: 4,
  email_queue: 5,
  capstone_submissions: 6,
  user_feedback: 7,
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => {
    if (clientThrows) throw new Error('no client')
    return {
      from: (table: string) => {
        fromCalls.push(table)
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          limit: () => chain,
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: null, error: countErrors[table] ?? null, count: COUNTS[table] ?? 0 }),
        }
        return chain
      },
    }
  },
}))

const { AdminConsoleService } = await import('../admin/service')
const { POST: revalidatePost } = await import('../../app/api/admin/cache/revalidate/route')

const ADMIN = { authorized: true, userId: 'admin-1', email: 'admin@prodily.app' }

beforeEach(() => {
  unstableCacheCalls.length = 0
  fromCalls.length = 0
  countErrors = {}
  clientThrows = false
  revalidateTag.mockReset()
  requireAdminUser.mockReset().mockResolvedValue(ADMIN)
})

// ─── getConsoleShellContext ──────────────────────────────────────────────────

describe('B4 — console shell context', () => {
  it('runs only the six head counts, with no separate users probe', async () => {
    await AdminConsoleService.getConsoleShellContext()

    expect(fromCalls).not.toContain('users')
    expect([...fromCalls].sort()).toEqual(Object.keys(COUNTS).sort())
  })

  it('caches the counts for 30s under the admin-shell tag with a stable key', async () => {
    await AdminConsoleService.getConsoleShellContext()

    expect(unstableCacheCalls).toHaveLength(1)
    expect(unstableCacheCalls[0].keyParts).toEqual(['admin-console-shell-context'])
    expect(unstableCacheCalls[0].options).toEqual({ revalidate: 30, tags: ['admin-shell'] })
  })

  it('keeps the return shape and derives status from the count batch', async () => {
    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.attention).toEqual({
      contactMessages: 2,
      pendingTestimonials: 3,
      systemErrors: 4,
      failedEmails: 5,
      pendingCapstones: 6,
      newFeedback: 7,
    })
    expect(ctx.attentionTotal).toBe(27)
    expect(ctx.systemOnline).toBe(true)
    expect(typeof ctx.databaseLatencyMs).toBe('number')
    expect(ctx.databaseLatencyMs).toBeGreaterThanOrEqual(0)
  })

  it('reports offline but keeps the counts that came back when one count fails', async () => {
    countErrors = { system_errors: { message: 'boom' } }

    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx.systemOnline).toBe(false)
    expect(ctx.databaseLatencyMs).toBeNull()
    expect(ctx.attention.contactMessages).toBe(2)
    expect(ctx.attentionTotal).toBe(27)
  })

  it('falls back to zeros and offline when the client cannot be created', async () => {
    clientThrows = true

    const ctx = await AdminConsoleService.getConsoleShellContext()

    expect(ctx).toEqual({
      attention: {
        contactMessages: 0,
        pendingTestimonials: 0,
        systemErrors: 0,
        failedEmails: 0,
        pendingCapstones: 0,
        newFeedback: 0,
      },
      attentionTotal: 0,
      systemOnline: false,
      databaseLatencyMs: null,
    })
  })

  it('never calls request-scoped APIs inside the cached shell loader', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../admin/service.ts'), 'utf8')
    const start = source.indexOf('public static async getConsoleShellContext')
    const end = source.indexOf('public static async', start + 1)
    const body = source.slice(start, end)

    expect(body).toContain('createServiceRoleClient()')
    expect(body).not.toMatch(/\bcookies\s*\(/)
    expect(body).not.toMatch(/\bheaders\s*\(/)
    expect(body).not.toMatch(/createServerSupabaseClient|createClient\s*\(/)
  })
})

// ─── Mutation routes ─────────────────────────────────────────────────────────

describe('B4 — mutations that change a shell count expire admin-shell', () => {
  const API_DIR = path.resolve(import.meta.dirname, '../../app/api/admin')
  const ROUTES = [
    'capstones/[id]/review',
    'feedback/[id]',
    'contact',
    'emails/queue',
    'emails/queue/retry-all',
    'emails/queue/retry-selected',
    'emails/queue/[id]/retry',
    'system/errors',
    'fellow-requests/[id]',
  ]

  it.each(ROUTES)('%s calls revalidateAdminShell()', (route) => {
    const source = readFileSync(path.join(API_DIR, route, 'route.ts'), 'utf8')

    expect(source).toContain("import { revalidateAdminShell } from '@/lib/admin/cache-tags'")
    expect(source).toMatch(/\brevalidateAdminShell\(\)/)
  })
})

// ─── POST /api/admin/cache/revalidate ────────────────────────────────────────

function revalidateReq(body: unknown) {
  return new NextRequest('https://prodily.app/api/admin/cache/revalidate', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}
const noParams = () => ({ params: Promise.resolve({}) })

describe('B4 — POST /api/admin/cache/revalidate', () => {
  it.each(['admin-dashboard', 'admin-analytics', 'admin-shell', 'admin-automations'])(
    'expires the allowlisted tag %s immediately',
    async (tag) => {
      const res = await revalidatePost(revalidateReq({ tag }), noParams())

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true, tag })
      expect(revalidateTag).toHaveBeenCalledTimes(1)
      expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 })
    }
  )

  it.each([{ tag: 'system_settings' }, { tag: 'testimonials' }, { tag: 42 }, {}, 'not json'])(
    'rejects an unknown or missing tag (%j) with 400',
    async (body) => {
      const res = await revalidatePost(revalidateReq(body), noParams())

      expect(res.status).toBe(400)
      expect(revalidateTag).not.toHaveBeenCalled()
    }
  )

  it('refuses an authenticated non-admin with 403', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    const res = await revalidatePost(revalidateReq({ tag: 'admin-shell' }), noParams())

    expect(res.status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller with 401', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Authentication required',
      statusCode: 401,
    })

    const res = await revalidatePost(revalidateReq({ tag: 'admin-shell' }), noParams())

    expect(res.status).toBe(401)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
