/**
 * Perf plan item 7: the readable `prodily_signed_in` hint cookie.
 *
 * Every path that writes the session goes through `setSessionCookies` (B13-A), and every
 * path that ends it through `clearSessionCookies`, so the hint is written and cleared there.
 * These tests pin the helper and the routes that sign in and out through it: login, signup
 * and the OAuth callback set it (the callback is covered in oauth-google-callback.test.ts),
 * refresh renews it, and logout and the session sign-out clear it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'

const h = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  createAuthenticatedServerClient: () => ({ auth: { signOut: h.signOut } }),
}))

import {
  SIGNED_IN_HINT_COOKIE,
  REFRESH_TOKEN_MAX_AGE,
  setSessionCookies,
  clearSessionCookies,
} from '@/lib/auth/session-cookies'
import { POST as logoutPost } from '../../app/api/auth/logout/route'
import { POST as sessionPost } from '../../app/api/auth/session/route'

const ROOT = path.resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/**
 * The suite's next/server mock (vitest.setup.ts) keeps only cookie names and values, so the
 * options are read from a recorder standing in for the response.
 */
type CookieOptions = { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number }
function recorder() {
  const writes: Array<{ name: string; value: string; options: CookieOptions }> = []
  const response = {
    cookies: {
      set: (name: string, value: string, options: CookieOptions) => {
        writes.push({ name, value, options })
      },
    },
  } as unknown as NextResponse
  const hint = () => writes.filter((w) => w.name === SIGNED_IN_HINT_COOKIE).at(-1)
  return { response, writes, hint }
}

beforeEach(() => {
  h.signOut.mockReset()
})

describe('the signed-in hint cookie', () => {
  it('is set with the session: value 1, readable by page JavaScript, lax, path /, session lifetime', () => {
    const r = recorder()
    setSessionCookies(r.response, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 })
    expect(r.hint()).toEqual({
      name: SIGNED_IN_HINT_COOKIE,
      value: '1',
      options: { httpOnly: false, secure: false, sameSite: 'lax', path: '/', maxAge: REFRESH_TOKEN_MAX_AGE },
    })
  })

  it('leaves the session cookies httpOnly', () => {
    const r = recorder()
    setSessionCookies(r.response, { access_token: 'at', refresh_token: 'rt' })
    for (const w of r.writes.filter((x) => x.name.startsWith('sb-'))) {
      expect(w.options.httpOnly).toBe(true)
    }
  })

  it('holds no token or identifier', () => {
    const r = recorder()
    setSessionCookies(r.response, { access_token: 'secret-at', refresh_token: 'secret-rt' })
    expect(JSON.stringify(r.hint())).not.toMatch(/secret/)
  })

  it('is set even when the issuing path has no refresh token (refresh keeps the old one)', () => {
    const r = recorder()
    setSessionCookies(r.response, { access_token: 'at' })
    expect(r.hint()?.value).toBe('1')
  })

  it('is Secure in production only', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const r = recorder()
      setSessionCookies(r.response, { access_token: 'at' })
      expect(r.hint()?.options.secure).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('is cleared with the session, with the same path and attributes', () => {
    const r = recorder()
    clearSessionCookies(r.response)
    expect(r.hint()).toEqual({
      name: SIGNED_IN_HINT_COOKIE,
      value: '',
      options: { httpOnly: false, secure: false, sameSite: 'lax', path: '/', maxAge: 0 },
    })
  })
})

type RouteResponse = Response & { cookies: { get(name: string): { value: string } | undefined } }

describe('auth routes', () => {
  it('POST /api/auth/logout clears the hint', async () => {
    const req = new NextRequest('https://prodily.app/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `sb-access-token=at; ${SIGNED_IN_HINT_COOKIE}=1`, origin: 'https://prodily.app' },
    })
    const res = (await logoutPost(req, { params: Promise.resolve({}) })) as RouteResponse
    expect(res.status).toBe(200)
    expect(res.cookies.get(SIGNED_IN_HINT_COOKIE)?.value).toBe('')
    expect(res.cookies.get(SIGNED_IN_HINT_COOKIE)?.value).toBe('')
    expect(res.cookies.get('sb-access-token')?.value).toBe('')
  })

  it('POST /api/auth/session (sign out) clears the hint', async () => {
    const req = new NextRequest('https://prodily.app/api/auth/session', {
      method: 'POST',
      headers: { cookie: `${SIGNED_IN_HINT_COOKIE}=1`, origin: 'https://prodily.app' },
    })
    const res = (await sessionPost(req, { params: Promise.resolve({}) })) as RouteResponse
    expect(res.status).toBe(200)
    expect(res.cookies.get(SIGNED_IN_HINT_COOKIE)?.value).toBe('')
  })

  it.each([
    'app/api/auth/login/route.ts',
    'app/api/auth/signup/route.ts',
    'app/api/auth/callback/route.ts',
    'app/api/auth/refresh/route.ts',
  ])('%s writes the session through setSessionCookies, which sets the hint', (rel) => {
    expect(read(rel)).toContain('setSessionCookies(')
  })

  it('the session-ending refresh path clears through clearSessionCookies', () => {
    expect(read('app/api/auth/refresh/route.ts')).toContain('clearSessionCookies(')
  })
})
