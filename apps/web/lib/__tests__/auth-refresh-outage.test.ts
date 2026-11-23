/**
 * Audit M5: a short Supabase outage used to log users out for good. Any refresh error,
 * including network errors and auth-server 5xx, deleted a refresh cookie that was still
 * valid. Only a definite 4xx from the auth server may end the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, type NextResponse } from 'next/server'

const refreshState = vi.hoisted(() => ({ result: { data: { session: null, user: null }, error: null } as unknown }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getClaims: vi.fn(async () => ({ data: null, error: new Error('expired') })),
      getUser: vi.fn(async () => ({ data: { user: null }, error: new Error('expired') })),
      refreshSession: vi.fn(async () => refreshState.result),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  }),
}))

import { isDefiniteRefreshFailure } from '../auth/refresh-failure'
import { proxy } from '../../proxy'
import { POST as refreshPOST } from '../../app/api/auth/refresh/route'

const retryable = { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' }
const serverError = { name: 'AuthApiError', status: 503, message: 'upstream unavailable' }
const invalidGrant = { name: 'AuthApiError', status: 400, message: 'Invalid Refresh Token: Refresh Token Not Found' }

/**
 * True when the response clears the given cookie (sets it to an empty value).
 * vitest.setup.ts mocks next/server with a plain cookie map, so a cleared cookie shows
 * up as an empty value; Set-Cookie headers are not visible in this environment.
 */
function clearsCookie(res: Response, name: string): boolean {
  return (res as NextResponse).cookies?.get(name)?.value === ''
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('isDefiniteRefreshFailure', () => {
  it('treats auth-server 4xx as a definite failure', () => {
    expect(isDefiniteRefreshFailure(invalidGrant)).toBe(true)
    expect(isDefiniteRefreshFailure({ status: 401 })).toBe(true)
  })

  it('treats network errors, 5xx and unknown shapes as transient', () => {
    expect(isDefiniteRefreshFailure(retryable)).toBe(false)
    expect(isDefiniteRefreshFailure(serverError)).toBe(false)
    expect(isDefiniteRefreshFailure(new Error('boom'))).toBe(false)
    expect(isDefiniteRefreshFailure(null)).toBe(false)
  })
})

describe('proxy: app page with an expired access token', () => {
  function dashboard() {
    return new NextRequest('https://prodily.app/dashboard', {
      headers: { cookie: 'sb-access-token=expired; sb-refresh-token=still-valid' },
    })
  }

  // The 503 is a fresh response that never touches the cookies, so the browser keeps
  // them. The sign-out path is the existing redirect that deletes both cookies.
  it('answers 503 (a retry page that does not touch cookies) when the auth server cannot be reached', async () => {
    refreshState.result = { data: { session: null, user: null }, error: retryable }
    const res = await proxy(dashboard())
    expect(res.status).toBe(503)
    expect(res.headers.get('retry-after')).toBe('5')
    expect(res.headers.get('location')).toBeNull()
    expect((res as NextResponse).cookies.getAll()).toEqual([])
  })

  it('answers 503 on an auth-server 5xx', async () => {
    refreshState.result = { data: { session: null, user: null }, error: serverError }
    const res = await proxy(dashboard())
    expect(res.status).toBe(503)
    expect(res.headers.get('location')).toBeNull()
  })

  it('answers 503 when the refresh call throws', async () => {
    refreshState.result = Promise.reject(new Error('socket hang up'))
    const res = await proxy(dashboard())
    expect(res.status).toBe(503)
  })

  it('redirects to login (the sign-out path) when the refresh token is really invalid', async () => {
    refreshState.result = { data: { session: null, user: null }, error: invalidGrant }
    const res = await proxy(dashboard())
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/login')
  })
})

describe('POST /api/auth/refresh', () => {
  function refreshRequest() {
    return new NextRequest('https://prodily.app/api/auth/refresh', {
      method: 'POST',
      headers: { cookie: 'sb-refresh-token=still-valid', origin: 'https://prodily.app', 'content-type': 'application/json' },
      body: '{}',
    })
  }

  it('answers 503 and keeps the cookies on a transient failure', async () => {
    refreshState.result = { data: { session: null, user: null }, error: retryable }
    const res = await refreshPOST(refreshRequest())
    expect(res.status).toBe(503)
    expect(clearsCookie(res, 'sb-refresh-token')).toBe(false)
    expect(clearsCookie(res, 'sb-access-token')).toBe(false)
  })

  it('answers 401 and clears the cookies when the token is invalid', async () => {
    refreshState.result = { data: { session: null, user: null }, error: invalidGrant }
    const res = await refreshPOST(refreshRequest())
    expect(res.status).toBe(401)
    expect(clearsCookie(res, 'sb-refresh-token')).toBe(true)
  })
})
