import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const signOutMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createBrowserSupabaseClient: () => ({ auth: { signOut: signOutMock } }),
}))

const { logout, LEARNER_LOGIN_PATH, ADMIN_LOGIN_PATH } = await import('@/lib/auth/logout')
const { signOutAdmin } = await import('@/lib/admin/session')

function createRouter() {
  return { push: vi.fn(), refresh: vi.fn() }
}

const APP_DIR = path.resolve(import.meta.dirname, '../../app')

describe('B10-A — error boundary structure', () => {
  it('app/global-error.tsx exists and carries the document shell', () => {
    const source = readFileSync(path.join(APP_DIR, 'global-error.tsx'), 'utf8')

    expect(source).toContain('<html')
    expect(source).toContain('<body')
    expect(source.startsWith("'use client'")).toBe(true)
  })

  it('app/error.tsx is a segment boundary and emits no document shell', () => {
    const source = readFileSync(path.join(APP_DIR, 'error.tsx'), 'utf8')

    expect(source).not.toContain('<html')
    expect(source).not.toContain('<body')
    expect(source.startsWith("'use client'")).toBe(true)
  })

  it('the nested segment boundaries still emit no document shell', () => {
    for (const relative of ['(app)/error.tsx', 'admin/(console)/error.tsx']) {
      const source = readFileSync(path.join(APP_DIR, relative), 'utf8')
      expect(source).not.toContain('<html')
      expect(source).not.toContain('<body')
    }
  })
})

describe('B10-A — logout', () => {
  beforeEach(() => {
    signOutMock.mockReset()
    signOutMock.mockResolvedValue({ error: null })
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof global.fetch
  })

  it('reports success and navigates when both steps succeed', async () => {
    const router = createRouter()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(router.push).toHaveBeenCalledWith('/login')
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('navigates even when the provider sign-out rejects', async () => {
    signOutMock.mockRejectedValue(new Error('network down'))
    const router = createRouter()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(router.push).toHaveBeenCalledWith('/login')
    expect(result.ok).toBe(false)
    expect(result.failures.map((f) => f.step)).toContain('provider_sign_out')
  })

  it('still clears the server session cookies when the provider sign-out rejects', async () => {
    signOutMock.mockRejectedValue(new Error('network down'))
    const router = createRouter()

    await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toBe('/api/auth/session')
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      action: 'sign_out',
      session: null,
    })
  })

  it('navigates and reports failure when the cookie-clearing call rejects', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof global.fetch
    const router = createRouter()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(router.push).toHaveBeenCalledWith('/login')
    expect(result.ok).toBe(false)
    expect(result.failures.map((f) => f.step)).toContain('session_cookie_clear')
  })

  it('treats a non-ok cookie-clearing response as a failure rather than silent success', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as typeof global.fetch
    const router = createRouter()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(result.ok).toBe(false)
    expect(result.failures.map((f) => f.step)).toContain('session_cookie_clear')
  })

  it('surfaces a provider-returned error object without throwing', async () => {
    signOutMock.mockResolvedValue({ error: { message: 'session missing' } })
    const router = createRouter()

    const result = await logout(router, { redirectTo: LEARNER_LOGIN_PATH })

    expect(result.ok).toBe(false)
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].step).toBe('provider_sign_out')
  })

  it('never places the caller-supplied destination outside the app', async () => {
    const router = createRouter()

    await logout(router, { redirectTo: LEARNER_LOGIN_PATH })
    await logout(router, { redirectTo: ADMIN_LOGIN_PATH })

    for (const [destination] of router.push.mock.calls) {
      expect(String(destination).startsWith('/')).toBe(true)
      expect(String(destination).startsWith('//')).toBe(false)
    }
  })
})

describe('B10-A — signOutAdmin delegates to the canonical helper', () => {
  beforeEach(() => {
    signOutMock.mockReset()
    signOutMock.mockResolvedValue({ error: null })
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as typeof global.fetch
  })

  it('navigates to the admin login page', async () => {
    const router = createRouter()

    await signOutAdmin(router)

    expect(router.push).toHaveBeenCalledWith('/admin/login')
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('navigates even when every network step fails', async () => {
    signOutMock.mockRejectedValue(new Error('offline'))
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof global.fetch
    const router = createRouter()

    await signOutAdmin(router)

    expect(router.push).toHaveBeenCalledWith('/admin/login')
  })
})
