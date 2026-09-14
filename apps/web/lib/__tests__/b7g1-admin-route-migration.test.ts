import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const requireAdminUser = vi.fn()
const logAdminAction = vi.fn()

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
  logAdminAction: (...args: unknown[]) => logAdminAction(...args),
}))

const cancelBroadcast = vi.fn()
vi.mock('@/lib/admin/broadcast-service', () => ({
  BroadcastService: { cancelBroadcast: (id: string) => cancelBroadcast(id) },
}))

const { POST: cancelPost } = await import(
  '../../app/api/admin/emails/broadcasts/[id]/cancel/route'
)

const ADMIN = { authorized: true, userId: 'admin-1', email: 'admin@prodily.app' }
const URL_ = 'https://prodily.app/api/admin/emails/broadcasts/bc-1/cancel'

function req() {
  return new NextRequest(URL_, { method: 'POST' })
}

function ctx() {
  return { params: Promise.resolve({ id: 'bc-1' }) }
}

beforeEach(() => {
  requireAdminUser.mockReset().mockResolvedValue(ADMIN)
  logAdminAction.mockReset().mockResolvedValue(undefined)
  cancelBroadcast.mockReset().mockResolvedValue({ success: true })
})

describe('B7-G1 — the admin actor policy', () => {
  it('runs the handler for an authenticated admin', async () => {
    const res = await cancelPost(req(), ctx())

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, message: 'Broadcast cancelled.' })
  })

  it('refuses an authenticated non-admin with 403 and the canonical code', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    const res = await cancelPost(req(), ctx())
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.code).toBe('FORBIDDEN')
    expect(cancelBroadcast).not.toHaveBeenCalled()
  })

  it('refuses an unauthenticated caller with 401', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Authentication required',
      statusCode: 401,
    })

    const res = await cancelPost(req(), ctx())

    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe('UNAUTHORIZED')
  })

  it('does not disclose the guard\'s internal denial reason', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    const body = await (await cancelPost(req(), ctx())).json()

    expect(JSON.stringify(body)).not.toContain('Admin privileges required')
  })

  it('still re-reads is_admin from the database through the existing guard', async () => {
    await cancelPost(req(), ctx())

    // resolveActor delegates rather than reimplementing, so the guard's
    // service-role re-read of users.is_admin is unchanged.
    expect(requireAdminUser).toHaveBeenCalledTimes(1)
  })
})

describe('B7-G1 — audit logging is intact', () => {
  it('records the admin action with the resolved admin identity', async () => {
    await cancelPost(req(), ctx())

    expect(logAdminAction).toHaveBeenCalledWith(
      'admin-1',
      'admin@prodily.app',
      'CANCEL_BROADCAST',
      'email_broadcasts',
      'bc-1',
      {}
    )
  })

  it('does not record an admin action when the caller is refused', async () => {
    requireAdminUser.mockResolvedValue({ authorized: false, statusCode: 403, error: 'nope' })

    await cancelPost(req(), ctx())

    // The denial audit row is written by requireAdminUser itself, which
    // resolveActor still calls — it is not this route's job.
    expect(logAdminAction).not.toHaveBeenCalled()
  })

  it('resolves the dynamic route param through the wrapper', async () => {
    await cancelPost(req(), ctx())

    expect(cancelBroadcast).toHaveBeenCalledWith('bc-1')
  })
})

describe('B7-G1 — admin error detail is still surfaced (D-02)', () => {
  it('returns the underlying failure text rather than generic copy', async () => {
    cancelBroadcast.mockRejectedValue(new Error('duplicate key value violates unique constraint'))

    const res = await cancelPost(req(), ctx())
    const body = await res.json()

    expect(res.status).toBe(500)
    // Admins deliberately keep the diagnostic: a refused operation is actionable
    // with the database error and useless as "something went wrong".
    expect(body.error).toContain('duplicate key value violates unique constraint')
  })

  it('still redacts credentials out of that detail', async () => {
    cancelBroadcast.mockRejectedValue(
      new Error('connect failed for postgresql://user:hunter2@db.internal:5432/app')
    )

    const body = await (await cancelPost(req(), ctx())).json()

    expect(body.error).not.toContain('hunter2')
  })

  it('keeps every G1 route on adminErrorMessage rather than the generic envelope', () => {
    const G1 = ['emails', 'notifications', 'announcements']
    const API_DIR = path.resolve(import.meta.dirname, '../../app/api/admin')

    let checked = 0
    for (const group of G1) {
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry)
          if (statSync(full).isDirectory()) walk(full)
          else if (entry === 'route.ts') {
            const source = readFileSync(full, 'utf8')
            if (source.includes('adminErrorMessage')) checked += 1
            expect(source).not.toContain('requireAdminUser')
          }
        }
      }
      walk(path.join(API_DIR, group))
    }

    // Most G1 routes carry an adminErrorMessage catch; the migration must not have
    // replaced any of them with the wrapper's generic copy.
    expect(checked).toBeGreaterThanOrEqual(30)
  })
})

describe('B7-G1 — migration scope', () => {
  const API_DIR = path.resolve(import.meta.dirname, '../../app/api')

  function routeFilesImporting(needle: string): string[] {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts' && readFileSync(full, 'utf8').includes(needle)) {
          hits.push(path.relative(API_DIR, full).split(path.sep).join('/'))
        }
      }
    }
    walk(API_DIR)
    return hits.sort()
  }

  const migrated = routeFilesImporting('@/lib/api/with-route')

  it('migrates exactly the 37 G1 admin routes', () => {
    const admin = migrated.filter((f) => f.startsWith('admin/'))

    expect(admin).toHaveLength(37)
    expect(admin.every((f) => /^admin\/(emails|notifications|announcements)\//.test(f))).toBe(true)
  })

  it('leaves every G2 admin group untouched', () => {
    const G2 = [
      'users', 'system', 'feedback', 'fellow-requests', 'capstones', 'content',
      'settings', 'audit', 'search', 'summary', 'contact', 'feature-flags', 'verify', 'dev',
    ]

    for (const group of G2) {
      expect(migrated.filter((f) => f.startsWith(`admin/${group}/`))).toEqual([])
    }
  })

  it('owns the global migrated set, so earlier waves assert only their own', () => {
    expect(migrated.filter((f) => f.startsWith('cron/'))).toHaveLength(6)
    expect(migrated.filter((f) => f.startsWith('auth/'))).toHaveLength(8)
    expect(migrated.filter((f) => f.startsWith('settings/'))).toHaveLength(11)
    expect(migrated.filter((f) => f.startsWith('admin/'))).toHaveLength(37)
    expect(migrated).toHaveLength(62)
  })
})
