import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { validateOptionalUrl, validateWritableUrl } from '@/lib/portfolio'

const getAuthenticatedUserFromRequest = vi.fn()
const updateChain = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createServiceRoleClient: () => ({
      from: () => ({
        update: (values: unknown) => ({ eq: async () => updateChain(values) }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }) }),
      }),
    }),
  }
})

const { POST: profilePost } = await import('../../app/api/settings/profile/route')

const LEARNER = { id: 'user-1', email: 'learner@prodily.app' }
const PROFILE_URL = 'https://prodily.app/api/settings/profile'

function profileRequest(body: unknown): Request {
  return new Request(PROFILE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(LEARNER)
  updateChain.mockReset().mockResolvedValue({ error: null })
})

// ─── N-2: https-only on the write side ───────────────────────────────────────

describe('B7-F / N-2 — write-side URL policy is https-only', () => {
  it('accepts an https URL', () => {
    expect(validateWritableUrl('https://linkedin.com/in/jane')).toBe(true)
  })

  it('rejects an http URL', () => {
    expect(validateWritableUrl('http://linkedin.com/in/jane')).toBe(false)
  })

  it('still treats an absent value as valid, since the fields are optional', () => {
    expect(validateWritableUrl('')).toBe(true)
    expect(validateWritableUrl(null)).toBe(true)
    expect(validateWritableUrl(undefined)).toBe(true)
    expect(validateWritableUrl('   ')).toBe(true)
  })

  it('rejects the dangerous schemes the read-side guard already rejected', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:alert(1)',
      'file:///etc/passwd',
      '//evil.com',
      'not-a-url',
    ]) {
      expect(validateWritableUrl(hostile)).toBe(false)
    }
  })
})

describe('B7-F / N-2 — the read-side guard is deliberately unchanged', () => {
  // Tightening validateOptionalUrl would have silently un-rendered the portfolio
  // links of every existing user who stored an http:// URL before this batch.
  // It guards rendering (is this safe to emit as an href?), not write policy.
  it('still accepts a stored http URL so existing portfolios keep rendering', () => {
    expect(validateOptionalUrl('http://mywebsite.com')).toBe(true)
  })

  it('still rejects hostile schemes', () => {
    expect(validateOptionalUrl('javascript:alert(1)')).toBe(false)
    expect(validateOptionalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
  })

  it('is a different function from the write-side validator', () => {
    expect(validateOptionalUrl('http://x.com')).toBe(true)
    expect(validateWritableUrl('http://x.com')).toBe(false)
  })
})

describe('B7-F / N-2 — the profile route rejects http on write', () => {
  it('rejects an http linkedin_url with a clear message', async () => {
    const res = await profilePost(profileRequest({ linkedin_url: 'http://linkedin.com/in/jane' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION')
    expect(body.error).toContain('https://')
    expect(updateChain).not.toHaveBeenCalled()
  })

  it('rejects http on every URL field', async () => {
    for (const field of ['linkedin_url', 'github_url', 'website_url']) {
      const res = await profilePost(profileRequest({ [field]: 'http://example.com' }))
      expect(res.status).toBe(400)
    }
  })

  it('still saves a valid https profile', async () => {
    const res = await profilePost(
      profileRequest({
        name: 'Jane',
        bio: 'PM',
        linkedin_url: 'https://linkedin.com/in/jane',
        github_url: 'https://github.com/jane',
        website_url: 'https://jane.dev',
      })
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(updateChain).toHaveBeenCalledTimes(1)
  })

  it('still saves a profile with the URL fields left empty', async () => {
    const res = await profilePost(profileRequest({ name: 'Jane' }))

    expect(res.status).toBe(200)
    expect(updateChain).toHaveBeenCalledTimes(1)
  })
})

// ─── N-3: no raw exception text on the wire ──────────────────────────────────

describe('B7-F / N-3 — an exception never reaches the client', () => {
  it('returns generic copy plus an errorId instead of the exception message', async () => {
    updateChain.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432'))

    const res = await profilePost(profileRequest({ name: 'Jane' }))
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.code).toBe('SERVER_ERROR')
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(body)).not.toContain('10.0.0.1')
  })
})

// ─── Wrapper behaviour ───────────────────────────────────────────────────────

describe('B7-F — the settings routes are behind the canonical actor policy', () => {
  it('refuses an unauthenticated caller with the canonical 401 envelope', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(null)

    const res = await profilePost(profileRequest({ name: 'Jane' }))
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.code).toBe('UNAUTHORIZED')
    expect(updateChain).not.toHaveBeenCalled()
  })

  it('rejects a malformed JSON body with 400 VALIDATION', async () => {
    const res = await profilePost(
      new Request(PROFILE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('VALIDATION')
  })
})

// ─── Scope ───────────────────────────────────────────────────────────────────

describe('B7-F — migration scope', () => {
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

  it('migrates every settings route', () => {
    const migrated = routeFilesImporting('@/lib/api/with-route')
    const settings = migrated.filter((f) => f.startsWith('settings/'))

    expect(settings).toEqual([
      'settings/delete-account/route.ts',
      'settings/notifications/route.ts',
      'settings/portfolio/route.ts',
      'settings/profile/route.ts',
      'settings/reset/flashcards/route.ts',
      'settings/reset/progress/route.ts',
      'settings/reset/skill-radar/route.ts',
      'settings/reset/streak/route.ts',
      'settings/reset/xp/route.ts',
      'settings/security/change-email/route.ts',
      'settings/security/route.ts',
    ])
  })

  it('leaves no settings route resolving the actor itself', () => {
    const settingsDir = path.join(API_DIR, 'settings')
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts') {
          expect(readFileSync(full, 'utf8')).not.toContain('getAuthenticatedUserFromRequest')
        }
      }
    }
    walk(settingsDir)
  })

  // The global migrated set is owned by b7g1-admin-route-migration.test.ts. This
  // asserts only that the waves completed before B7-F are still intact.
  it('keeps the cron and auth waves intact', () => {
    const migrated = routeFilesImporting('@/lib/api/with-route')

    expect(migrated.filter((f) => f.startsWith('cron/'))).toHaveLength(6)
    expect(migrated.filter((f) => f.startsWith('auth/'))).toHaveLength(8)
  })
})
