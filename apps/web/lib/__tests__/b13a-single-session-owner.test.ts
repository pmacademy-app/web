import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

import {
  CLIENT_TYPE_HEADER,
  NATIVE_CLIENT_TYPE,
  isNativeClient,
  sessionForClient,
} from '@/lib/auth/client-type'

/**
 * B13-A — one session store.
 *
 * `F-02` and `F-SEC-8`: the refresh token sat in `localStorage` *and* in an httpOnly
 * cookie. Two stores that could diverge, a cookie protection made decorative by the
 * copy beside it, and no way for a native client to participate in either. The login
 * and signup routes also returned the whole session in their JSON bodies.
 *
 * The completion criteria this file pins, from the roadmap:
 *
 *   - no `localStorage` session
 *   - bridge deleted
 *   - browser login response carries no tokens
 *   - native path documented and tested
 *   - session survives access-token expiry
 *
 * These are source-level and unit assertions. The batch also requires staging
 * verification and a monitored deploy, because it logs every existing user out once —
 * that is a human gate and nothing here can stand in for it.
 */

const ROOT = path.resolve(import.meta.dirname, '../../')
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8')

/** Strips comments so prose describing the old model is not read as the old model. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')
}

/**
 * Every source file under the app, read once.
 *
 * Four of the tests below scan the whole tree, and each used to do its own recursive
 * walk — re-reading every file in `app`, `components`, `lib` and `hooks` four times over.
 * Standalone that finished in well under a second; inside the full parallel suite, with
 * 160 other files competing for the disk, it crossed the 15s `testTimeout` and failed
 * intermittently on a machine under load. A test that fails because the machine is busy
 * teaches everyone to re-run rather than to look, which is worse than no test.
 *
 * Built lazily on first use so a `-t` filtered run that needs none of the scanning tests
 * does not pay for the walk at all.
 */
let sourceIndexCache: Array<{ rel: string; source: string }> | null = null

function sourceIndex(): Array<{ rel: string; source: string }> {
  if (sourceIndexCache) return sourceIndexCache

  const files: Array<{ rel: string; source: string }> = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      // Pruned at the directory rather than filtered after reading. `lib/__tests__`
      // holds the largest files in the repository, and reading all of them only to
      // discard them was most of this walk's cost.
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      const rel = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(rel)
      else if (/\.tsx?$/.test(entry.name)) files.push({ rel, source: read(rel) })
    }
  }
  for (const dir of ['app', 'components', 'lib', 'hooks']) walk(dir)

  sourceIndexCache = files
  return files
}

/**
 * The production sources. `__tests__` is already pruned by the walk, so this is the
 * index itself — kept as a named function because that is what the assertions mean.
 */
function productionSources(): Array<{ rel: string; source: string }> {
  return sourceIndex()
}

function headers(map: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => map[name.toLowerCase()] ?? null,
    },
  }
}

describe('B13-A — the browser holds no session', () => {
  it('the browser client disables persistence, auto-refresh and URL detection', () => {
    const source = code(read('lib/supabase.ts'))
    const factory = source.slice(source.indexOf('export function createBrowserSupabaseClient'))

    expect(factory).toContain('persistSession: false')
    expect(factory).toContain('autoRefreshToken: false')
    expect(factory).toContain('detectSessionInUrl: false')
  })

  it('the client session bridge component is deleted', () => {
    expect(existsSync(path.join(ROOT, 'components/layout/AuthStateListener.tsx'))).toBe(false)
  })

  it('nothing references the deleted bridge', () => {
    // Comments stripped: two modules document in prose what the bridge used to do and
    // why it went away, which is the opposite of referencing it.
    const offenders = productionSources()
      .filter((f) => code(f.source).includes('AuthStateListener'))
      .map((f) => f.rel)

    expect(offenders).toEqual([])
  })

  it('no client component subscribes to provider auth state changes', () => {
    const offenders = productionSources()
      .filter((f) => code(f.source).includes('onAuthStateChange'))
      .map((f) => f.rel)

    expect(offenders).toEqual([])
  })
})

describe('B13-A — the browser-session consumer sweep is complete', () => {
  /**
   * The five production consumers of `createBrowserSupabaseClient()` found before the
   * change, and what happened to each. The spec requires proving every consumer is
   * handled *before* flipping the client default, so the disposition is pinned here
   * rather than left to a changelog.
   */
  it('only the anonymous password-reset call still uses the browser client', () => {
    const consumers = productionSources()
      .filter((f) => f.rel !== 'lib/supabase.ts')
      .filter((f) => code(f.source).includes('createBrowserSupabaseClient'))
      .map((f) => f.rel)

    // `resetPasswordForEmail` is an anonymous provider call. It needs no session, and
    // it is the only thing the browser client is still for.
    expect(consumers).toEqual(['app/(auth)/reset-password/page.tsx'])
    expect(code(read('app/(auth)/reset-password/page.tsx'))).toContain('resetPasswordForEmail')
  })

  it('the admin console authenticates server-side, not in the browser', () => {
    const source = code(read('app/admin/login/page.tsx'))

    expect(source).not.toContain('signInWithPassword')
    expect(source).toContain("apiPost('/api/auth/login'")
    // Authentication is not authorization: the RBAC guard still runs before entry.
    expect(source).toContain('/api/admin/verify')
  })

  it('quick-start completion is written by the server from the cookie actor', () => {
    const client = code(read('components/quick-start/QuickStartContext.tsx'))
    expect(client).not.toContain('auth.updateUser')
    expect(client).toContain("apiPost('/api/user/quick-start')")

    const route = code(read('app/api/user/quick-start/route.ts'))
    // The user id comes from the resolved actor, never from the body — otherwise the
    // endpoint would be an IDOR.
    expect(route).toContain('requireUserId(actor)')
    expect(route).not.toContain('body.userId')
  })

  it('the unreachable implicit-flow recovery handler is gone', () => {
    const source = code(read('app/(auth)/reset-password/page.tsx'))
    // Recovery arrives as a `token_hash` link to /api/auth/callback, verified
    // server-side; no token ever reaches this page's URL.
    expect(source).not.toContain('setSession')
    expect(source).not.toContain('type=recovery')
  })

  it('logout no longer pretends to revoke a session the browser does not hold', () => {
    const source = code(read('lib/auth/logout.ts'))
    expect(source).not.toContain('createBrowserSupabaseClient')
    expect(source).toContain("action: 'sign_out'")
  })
})

describe('B13-A — no token reaches browser JavaScript', () => {
  const AUTH_ROUTES = [
    'app/api/auth/login/route.ts',
    'app/api/auth/signup/route.ts',
    'app/api/auth/refresh/route.ts',
  ]

  it.each(AUTH_ROUTES)('%s gates its session body on the client type', (rel) => {
    const source = code(read(rel))
    expect(source).toContain('sessionForClient(request')
    // An unconditional `session:` key would put the tokens in every response.
    expect(source).not.toMatch(/^\s*session: (authData|data)\.session,/m)
  })

  it('the session route accepts no session at all', () => {
    const source = code(read('app/api/auth/session/route.ts'))
    expect(source).not.toContain('createAuthenticatedServerClient')
    expect(source).not.toContain('access_token, refresh_token, expires_in')
    expect(source).toContain('clearSessionCookies')
  })

  it('a browser response omits the session key entirely rather than nulling it', () => {
    const browser = sessionForClient(headers({}), { access_token: 'a', refresh_token: 'r' })
    // `session: null` would still be a key a script could read and reason about; the
    // absence of the key is the stronger statement.
    expect('session' in browser).toBe(false)
    expect({ success: true, ...browser }).toEqual({ success: true })
  })
})

describe('B13-A — the native client path', () => {
  it('opts in by an exact, case-insensitive header value', () => {
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: NATIVE_CLIENT_TYPE }))).toBe(true)
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: 'NATIVE' }))).toBe(true)
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: '  native  ' }))).toBe(true)
  })

  it('treats anything else as a browser', () => {
    expect(isNativeClient(headers({}))).toBe(false)
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: 'web' }))).toBe(false)
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: 'native-ish' }))).toBe(false)
    expect(isNativeClient(headers({ [CLIENT_TYPE_HEADER]: '' }))).toBe(false)
  })

  it('returns the session to a native caller', () => {
    const session = { access_token: 'a', refresh_token: 'r' }
    const result = sessionForClient(
      headers({ [CLIENT_TYPE_HEADER]: NATIVE_CLIENT_TYPE }),
      session
    )
    expect(result).toEqual({ session })
  })

  it('is never consulted for authorization', () => {
    // The header is a caller's claim about itself and grants nothing. If it ever
    // appeared in actor resolution it would become a trivially forgeable privilege.
    const actor = code(read('lib/api/actor.ts'))
    expect(actor).not.toContain(CLIENT_TYPE_HEADER)
    expect(actor).not.toContain('isNativeClient')
  })
})

describe('B13-A — the session survives access-token expiry', () => {
  /**
   * The bridge used to keep the cookies fresh: supabase-js auto-refreshed in the
   * browser and `AuthStateListener` pushed the new token to the server. With both gone,
   * something server-side has to do it, or every session would die at the one-hour
   * access-token lifetime.
   *
   * `proxy.ts` already did: when the access token is absent or rejected and a refresh
   * cookie is present, it exchanges it and writes the rotated pair onto the response.
   * That is what makes this batch safe, so it is pinned rather than assumed.
   */
  it('the proxy exchanges an expired access token for a fresh pair', () => {
    const source = code(read('proxy.ts'))
    expect(source).toContain('refreshSession')
    expect(source).toContain('withSessionCookies')
    // The refresh is attempted precisely when the access token failed to resolve a user.
    expect(source).toMatch(/if \(!user && refreshToken\)/)
  })

  it('the proxy runs on the app and protected API surfaces', () => {
    const source = read('proxy.ts')
    const matcher = source.slice(source.indexOf('matcher'))
    // A matcher that skipped app pages would mean no refresh on navigation.
    expect(matcher).toContain('_next/static')
    expect(matcher).not.toMatch(/'\/api\/:path\*'/)
  })

  it('a dedicated refresh endpoint exists for clients with no cookie jar', () => {
    expect(existsSync(path.join(ROOT, 'app/api/auth/refresh/route.ts'))).toBe(true)
    const source = code(read('app/api/auth/refresh/route.ts'))
    // It reads the token from the body *or* the cookie, so both client kinds work.
    expect(source).toContain('sb-refresh-token')
    expect(source).toContain('body.refresh_token')
  })
})

describe('B13-A — the cookie contract has one definition', () => {
  it('the shared helper sets httpOnly, lax, path-scoped cookies', () => {
    const source = code(read('lib/auth/session-cookies.ts'))
    expect(source).toContain('httpOnly: true')
    expect(source).toContain("sameSite: 'lax' as const")
    expect(source).toContain("path: '/'")
    expect(source).toContain("secure: process.env.NODE_ENV === 'production'")
  })

  it('clearing uses the same options as setting, so the browser actually replaces them', () => {
    const source = code(read('lib/auth/session-cookies.ts'))
    const clear = source.slice(source.indexOf('export function clearSessionCookies'))
    expect(clear).toContain('baseOptions()')
    expect(clear).toContain('maxAge: 0')
  })

  it('nothing outside the helper writes a session cookie', () => {
    // Seven call sites used to set these names with their own hand-copied options.
    // A session model with one owner should have one writer.
    const offenders = productionSources()
      .filter((f) => code(f.source).includes("cookies.set('sb-"))
      .map((f) => f.rel)
    if (code(read('proxy.ts')).includes("cookies.set('sb-")) offenders.push('proxy.ts')

    // Empty rather than naming the helper: the helper writes through the exported
    // `ACCESS_TOKEN_COOKIE` / `REFRESH_TOKEN_COOKIE` constants, so the literal prefix
    // appears nowhere. A hit here is by definition a hand-rolled copy.
    expect(offenders).toEqual([])
  })
})
