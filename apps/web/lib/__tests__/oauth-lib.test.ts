/**
 * Google OAuth server library (T1): cookies, PKCE capture/exchange, signed intent,
 * fresh-account guard and the shared signup limits.
 *
 * The PKCE tests drive the REAL auth-js `signInWithOAuth` and `exchangeCodeForSession`
 * through our storage adapter. That is deliberate: the adapter depends on the exact
 * storage key auth-js uses for the verifier (`${storageKey}-code-verifier`). If an
 * auth-js upgrade renames or stops writing that key, these tests fail loudly instead
 * of every Google sign-in failing silently in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'node:crypto'
import { NextRequest, type NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/monitoring/log', () => ({
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    exception: vi.fn(),
    warnException: vi.fn(),
  },
}))

import {
  OAUTH_PKCE_COOKIE,
  OAUTH_INTENT_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_COOKIE_MAX_AGE,
  oauthCookieOptions,
  setOAuthCookies,
  readOAuthCookies,
  clearOAuthCookies,
} from '@/lib/auth/oauth-cookies'
import {
  OAUTH_STORAGE_KEY,
  OAUTH_VERIFIER_STORAGE_KEY,
  createPkceCaptureClient,
  createPkceExchangeClient,
  createVerifierOnlyStorage,
} from '@/lib/auth/oauth-pkce'
import {
  OAUTH_INTENT_MAX_AGE_MS,
  getOAuthStateSecret,
  signOAuthIntent,
  verifyOAuthIntent,
  sanitizeNextPath,
  type OAuthIntent,
} from '@/lib/auth/oauth-intent'
import {
  FRESH_ACCOUNT_WINDOW_MS,
  ACTIVITY_TABLES,
  hasPasswordIdentity,
  fetchHasPasswordIdentity,
  isFreshGoogleOnlyUser,
  deleteFreshGoogleUserIfSafe,
} from '@/lib/auth/oauth-account-guard'
import {
  SIGNUP_GLOBAL_LIMIT_KEY,
  AGGREGATE_SIGNUP_WINDOW_MS,
  AGGREGATE_SIGNUP_FLOOR,
  aggregateSignupCeiling,
} from '@/lib/auth/signup-limits'

const SECRET = 'x'.repeat(40)

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * vitest.setup.ts mocks `next/server` with a NextResponse whose cookie jar drops the
 * options, so the cookie tests record the `cookies.set` calls themselves.
 */
type CookieCall = { value: string; options: Record<string, unknown> }
function recordingResponse() {
  const calls = new Map<string, CookieCall>()
  const res = {
    cookies: {
      set: vi.fn((name: string, value: string, options: Record<string, unknown>) => {
        calls.set(name, { value, options })
      }),
    },
  }
  return { res: res as unknown as NextResponse, calls }
}

// ---------------------------------------------------------------------------
// oauth-cookies
// ---------------------------------------------------------------------------

describe('oauth-cookies', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('exports non-sb cookie names and the agreed scope', () => {
    expect(OAUTH_PKCE_COOKIE).toBe('prodily_oauth_pkce')
    expect(OAUTH_INTENT_COOKIE).toBe('prodily_oauth_intent')
    expect(OAUTH_COOKIE_PATH).toBe('/api/auth')
    expect(OAUTH_COOKIE_MAX_AGE).toBe(600)
  })

  it('options are httpOnly, lax, scoped to /api/auth, secure only in production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(oauthCookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 600,
    })
    vi.stubEnv('NODE_ENV', 'production')
    expect(oauthCookieOptions().secure).toBe(true)
  })

  it('sets both cookies and the verifier round-trips including its JSON quotes', () => {
    const verifier = '"abc-DEF_123.~xyz"'
    const { res, calls } = recordingResponse()
    expect(setOAuthCookies(res, { verifier, intent: 'payload.sig' })).toBe(res)

    const pkce = calls.get(OAUTH_PKCE_COOKIE)
    const intent = calls.get(OAUTH_INTENT_COOKIE)
    const expected = { httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600 }
    expect(pkce?.options).toMatchObject(expected)
    expect(intent?.options).toMatchObject(expected)
    expect(pkce?.value).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(intent?.value).toBe('payload.sig')

    const req = new NextRequest('https://prodily.app/api/auth/callback', {
      headers: { cookie: `${OAUTH_PKCE_COOKIE}=${pkce!.value}; ${OAUTH_INTENT_COOKIE}=${intent!.value}` },
    })
    expect(readOAuthCookies(req)).toEqual({ verifier, intent: 'payload.sig' })
  })

  it('reads null for missing cookies and for a verifier with bad encoding', () => {
    const empty = new NextRequest('https://prodily.app/api/auth/callback')
    expect(readOAuthCookies(empty)).toEqual({ verifier: null, intent: null })

    const bad = new NextRequest('https://prodily.app/api/auth/callback', {
      headers: { cookie: `${OAUTH_PKCE_COOKIE}=not*base64!; ${OAUTH_INTENT_COOKIE}=a.b` },
    })
    expect(readOAuthCookies(bad)).toEqual({ verifier: null, intent: 'a.b' })
  })

  it('clears both cookies with the same options and maxAge 0', () => {
    const { res, calls } = recordingResponse()
    expect(clearOAuthCookies(res)).toBe(res)
    for (const name of [OAUTH_PKCE_COOKIE, OAUTH_INTENT_COOKIE]) {
      const c = calls.get(name)
      expect(c?.value).toBe('')
      expect(c?.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 0 })
    }
  })
})

// ---------------------------------------------------------------------------
// oauth-pkce
// ---------------------------------------------------------------------------

describe('oauth-pkce storage adapter', () => {
  it('keeps only the legacy verifier key and ignores session and flow keys', async () => {
    const { storage, get } = createVerifierOnlyStorage(null)
    expect(OAUTH_STORAGE_KEY).toBe('prodily-oauth')
    expect(OAUTH_VERIFIER_STORAGE_KEY).toBe('prodily-oauth-code-verifier')

    await storage.setItem(OAUTH_STORAGE_KEY, '{"access_token":"t"}')
    await storage.setItem(`${OAUTH_STORAGE_KEY}-flow-0123abcd-code-verifier`, '"v1"')
    await storage.setItem(`${OAUTH_STORAGE_KEY}-flows-code-verifier`, '["0123abcd"]')
    await storage.setItem(`${OAUTH_STORAGE_KEY}-user`, '{"id":"u"}')
    expect(get()).toBeNull()
    expect(await storage.getItem(OAUTH_STORAGE_KEY)).toBeNull()
    expect(await storage.getItem(`${OAUTH_STORAGE_KEY}-flows-code-verifier`)).toBeNull()

    await storage.setItem(OAUTH_VERIFIER_STORAGE_KEY, '"the-verifier"')
    expect(get()).toBe('"the-verifier"')
    expect(await storage.getItem(OAUTH_VERIFIER_STORAGE_KEY)).toBe('"the-verifier"')

    await storage.removeItem(OAUTH_STORAGE_KEY)
    expect(get()).toBe('"the-verifier"')
    await storage.removeItem(OAUTH_VERIFIER_STORAGE_KEY)
    expect(get()).toBeNull()
  })

  it('exchange-side adapter returns the verifier only for the legacy key', async () => {
    const { storage } = createVerifierOnlyStorage('"seeded"')
    expect(await storage.getItem(OAUTH_VERIFIER_STORAGE_KEY)).toBe('"seeded"')
    expect(await storage.getItem(OAUTH_STORAGE_KEY)).toBeNull()
    expect(await storage.getItem(`${OAUTH_STORAGE_KEY}-flow-abc-code-verifier`)).toBeNull()
  })
})

describe('oauth-pkce against the real auth-js client', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signInWithOAuth captures a verifier whose S256 challenge is in the provider URL', async () => {
    const { client, getCapturedVerifier } = createPkceCaptureClient()
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://prodily.app/api/auth/callback',
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    })
    expect(error).toBeNull()
    expect(data.url).toBeTruthy()

    const raw = getCapturedVerifier()
    expect(raw).toBeTruthy()
    const verifier = JSON.parse(raw!) as unknown
    expect(typeof verifier).toBe('string')
    expect((verifier as string).length).toBeGreaterThanOrEqual(43)

    const url = new URL(data.url!)
    expect(url.searchParams.get('provider')).toBe('google')
    expect(url.searchParams.get('code_challenge_method')).toBe('s256')
    const expectedChallenge = createHash('sha256').update(verifier as string).digest('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(expectedChallenge)
    expect(url.searchParams.get('redirect_to')).toBe('https://prodily.app/api/auth/callback')
    // Building the provider URL never needs the network.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('exchange client sends the captured verifier to the token endpoint', async () => {
    const { client, getCapturedVerifier } = createPkceCaptureClient()
    await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://prodily.app/api/auth/callback', skipBrowserRedirect: true },
    })
    const raw = getCapturedVerifier()!

    const exchange = createPkceExchangeClient(raw)
    const { error } = await exchange.auth.exchangeCodeForSession('auth-code-1')
    expect(error).toBeTruthy()

    const tokenCall = fetchMock.mock.calls.find(([input]) => String(input).includes('grant_type=pkce'))
    expect(tokenCall).toBeTruthy()
    const body = JSON.parse(String((tokenCall![1] as RequestInit).body)) as Record<string, unknown>
    expect(body.auth_code).toBe('auth-code-1')
    expect(body.code_verifier).toBe(JSON.parse(raw))
  })

  it('exchange without a verifier fails before any network call', async () => {
    const exchange = createPkceExchangeClient('')
    const { error } = await exchange.auth.exchangeCodeForSession('auth-code-2')
    expect(error?.name).toBe('AuthPKCECodeVerifierMissingError')
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('grant_type=pkce'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// oauth-intent
// ---------------------------------------------------------------------------

describe('oauth-intent', () => {
  const now = 1_800_000_000_000
  const intent: OAuthIntent = { terms: true, age: true, ref: 'ABC123', next: '/learn/foo', iat: now }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('getOAuthStateSecret requires at least 32 chars', () => {
    vi.stubEnv('OAUTH_STATE_SECRET', '')
    expect(getOAuthStateSecret()).toBeNull()
    vi.stubEnv('OAUTH_STATE_SECRET', 'short')
    expect(getOAuthStateSecret()).toBeNull()
    vi.stubEnv('OAUTH_STATE_SECRET', SECRET)
    expect(getOAuthStateSecret()).toBe(SECRET)
  })

  it('sign/verify round-trips', () => {
    const token = signOAuthIntent(intent, SECRET)
    expect(token.split('.')).toHaveLength(2)
    expect(verifyOAuthIntent(token, SECRET, now + 1000)).toEqual(intent)
  })

  it('rejects tampered payload, tampered signature and the wrong secret', () => {
    const token = signOAuthIntent(intent, SECRET)
    const [payload, sig] = token.split('.')
    const forged = b64url(JSON.stringify({ ...intent, terms: true, next: '/admin' }))
    expect(verifyOAuthIntent(`${forged}.${sig}`, SECRET, now)).toBeNull()

    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A')
    expect(verifyOAuthIntent(`${payload}.${flipped}`, SECRET, now)).toBeNull()
    expect(verifyOAuthIntent(`${payload}.${sig.slice(0, 10)}`, SECRET, now)).toBeNull()
    expect(verifyOAuthIntent(token, 'y'.repeat(40), now)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    for (const bad of ['', 'abc', 'a.b.c', '.', 'abc.', '.abc']) {
      expect(verifyOAuthIntent(bad, SECRET, now)).toBeNull()
    }
    expect(verifyOAuthIntent(null as unknown as string, SECRET, now)).toBeNull()
  })

  it('rejects expired and future iat', () => {
    const token = signOAuthIntent(intent, SECRET)
    expect(verifyOAuthIntent(token, SECRET, now + OAUTH_INTENT_MAX_AGE_MS)).toEqual(intent)
    expect(verifyOAuthIntent(token, SECRET, now + OAUTH_INTENT_MAX_AGE_MS + 1)).toBeNull()
    expect(verifyOAuthIntent(token, SECRET, now - 5 * 60 * 1000)).toBeNull()
  })

  it('rejects a correctly signed payload with the wrong shape', () => {
    const shapes = [
      { ...intent, terms: 'yes' },
      { ...intent, age: 1 },
      { ...intent, ref: 42 },
      { ...intent, next: 7 },
      { ...intent, iat: 'now' },
      [intent],
    ]
    for (const shape of shapes) {
      const token = signOAuthIntent(shape as unknown as OAuthIntent, SECRET)
      expect(verifyOAuthIntent(token, SECRET, now)).toBeNull()
    }
  })

  it('re-sanitizes next on verify so a signed unsafe path cannot escape', () => {
    const token = signOAuthIntent({ ...intent, next: '//evil.com' }, SECRET)
    expect(verifyOAuthIntent(token, SECRET, now)?.next).toBe('/dashboard')
  })

  it('sanitizeNextPath keeps same-origin paths and rejects everything else', () => {
    expect(sanitizeNextPath('/learn/x?y=1#z')).toBe('/learn/x?y=1#z')
    expect(sanitizeNextPath('/dashboard')).toBe('/dashboard')
    for (const bad of [
      '//evil.com',
      '/\\evil.com',
      'https://x',
      '/api/x',
      '/API/x',
      '/api',
      'learn',
      '',
      '/a\\b',
      '/a\nb',
      '/a\u0000b',
      null,
      undefined,
    ]) {
      expect(sanitizeNextPath(bad as string | null | undefined)).toBe('/dashboard')
    }
    expect(sanitizeNextPath('//evil.com', '/login')).toBe('/login')
  })
})

// ---------------------------------------------------------------------------
// oauth-account-guard
// ---------------------------------------------------------------------------

type QueryResult = { data?: unknown; error?: unknown; count?: number | null }

function makeAdmin(opts: {
  usersRow?: QueryResult
  counts?: Partial<Record<string, QueryResult>>
  getUserById?: () => Promise<{ data: { user: unknown } | { user: null }; error: unknown }>
  deleteUser?: () => Promise<{ error: unknown }>
}) {
  const countFilters: Array<{ table: string; column: string; value: string }> = []
  const deleteUser = vi.fn(opts.deleteUser ?? (async () => ({ error: null })))
  const getUserById = vi.fn(opts.getUserById ?? (async () => ({ data: { user: null }, error: null })))
  const admin = {
    from: vi.fn((table: string) => ({
      select: vi.fn((_cols: string, selectOpts?: { count?: string; head?: boolean }) => ({
        eq: vi.fn((column: string, value: string) => {
          if (table === 'users') {
            return {
              maybeSingle: vi.fn(async () => opts.usersRow ?? { data: { auth_provider: 'google' }, error: null }),
            }
          }
          expect(selectOpts).toMatchObject({ count: 'exact', head: true })
          countFilters.push({ table, column, value })
          return Promise.resolve(opts.counts?.[table] ?? { count: 0, error: null, data: null })
        }),
      })),
    })),
    auth: { admin: { deleteUser, getUserById } },
  }
  return { admin: admin as never, deleteUser, getUserById, countFilters }
}

const NOW = Date.parse('2026-10-20T12:00:00Z')

function googleUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    aud: 'authenticated',
    created_at: new Date(NOW - 60_000).toISOString(),
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: {},
    identities: [
      {
        id: 'g1',
        identity_id: 'g1',
        user_id: 'user-1',
        provider: 'google',
        identity_data: {},
        created_at: '',
        last_sign_in_at: '',
        updated_at: '',
      },
    ],
    ...overrides,
  } as User
}

describe('oauth-account-guard', () => {
  it('exports the guard constants', () => {
    expect(FRESH_ACCOUNT_WINDOW_MS).toBe(30 * 60 * 1000)
    expect([...ACTIVITY_TABLES]).toEqual([
      'user_lesson_progress',
      'quiz_attempts',
      'xp_events',
      'capstone_submissions',
      'user_flashcard_srs',
    ])
  })

  it('hasPasswordIdentity detects an email identity or email in providers', () => {
    expect(hasPasswordIdentity(googleUser())).toBe(false)
    expect(hasPasswordIdentity({ identities: [], app_metadata: {} })).toBe(false)
    expect(hasPasswordIdentity({ identities: undefined, app_metadata: {} })).toBe(false)
    expect(
      hasPasswordIdentity({
        identities: [{ provider: 'email' } as never],
        app_metadata: {},
      })
    ).toBe(true)
    expect(
      hasPasswordIdentity({ identities: [], app_metadata: { providers: ['google', 'email'] } })
    ).toBe(true)
  })

  it('hasPasswordIdentity lets an explicit password_set flag win', () => {
    // A Google-only user who set a password through reset has no email identity.
    expect(
      hasPasswordIdentity({ identities: [{ provider: 'google' } as never], app_metadata: { password_set: true } })
    ).toBe(true)
    // The takeover defence rotated the password away, so an email identity no longer means one.
    expect(
      hasPasswordIdentity({
        identities: [{ provider: 'email' } as never, { provider: 'google' } as never],
        app_metadata: { providers: ['email', 'google'], password_set: false },
      })
    ).toBe(false)
  })

  it('fetchHasPasswordIdentity reads the auth user and is TRUE on lookup error', async () => {
    const ok = makeAdmin({ getUserById: async () => ({ data: { user: googleUser() }, error: null }) })
    expect(await fetchHasPasswordIdentity(ok.admin, 'user-1')).toBe(false)
    expect(ok.getUserById).toHaveBeenCalledWith('user-1')

    const pwd = makeAdmin({
      getUserById: async () => ({
        data: { user: googleUser({ app_metadata: { providers: ['email', 'google'] } }) },
        error: null,
      }),
    })
    expect(await fetchHasPasswordIdentity(pwd.admin, 'user-1')).toBe(true)

    const err = makeAdmin({ getUserById: async () => ({ data: { user: null }, error: new Error('down') }) })
    expect(await fetchHasPasswordIdentity(err.admin, 'user-1')).toBe(true)

    const thrown = makeAdmin({
      getUserById: async () => {
        throw new Error('network')
      },
    })
    expect(await fetchHasPasswordIdentity(thrown.admin, 'user-1')).toBe(true)
  })

  it('isFreshGoogleOnlyUser is true only when every guard passes, counting by user_id', async () => {
    const { admin, countFilters } = makeAdmin({})
    expect(await isFreshGoogleOnlyUser(admin, googleUser(), { now: NOW })).toBe(true)
    expect(countFilters.map((f) => f.table).sort()).toEqual([...ACTIVITY_TABLES].sort())
    for (const f of countFilters) {
      expect(f.column).toBe('user_id')
      expect(f.value).toBe('user-1')
    }
  })

  it('isFreshGoogleOnlyUser is false when the profile is not a google profile', async () => {
    const { admin } = makeAdmin({ usersRow: { data: { auth_provider: 'email' }, error: null } })
    expect(await isFreshGoogleOnlyUser(admin, googleUser(), { now: NOW })).toBe(false)
  })

  it('isFreshGoogleOnlyUser handles a missing profile row per profileMayBeMissing', async () => {
    const { admin } = makeAdmin({ usersRow: { data: null, error: null } })
    expect(await isFreshGoogleOnlyUser(admin, googleUser(), { now: NOW })).toBe(false)
    expect(
      await isFreshGoogleOnlyUser(admin, googleUser(), { now: NOW, profileMayBeMissing: true })
    ).toBe(true)
  })

  it('isFreshGoogleOnlyUser is false on a profile lookup error', async () => {
    const { admin } = makeAdmin({ usersRow: { data: null, error: { message: 'boom' } } })
    expect(
      await isFreshGoogleOnlyUser(admin, googleUser(), { now: NOW, profileMayBeMissing: true })
    ).toBe(false)
  })

  it('isFreshGoogleOnlyUser is false for an old account or a bad created_at', async () => {
    const { admin } = makeAdmin({})
    const old = googleUser({ created_at: new Date(NOW - FRESH_ACCOUNT_WINDOW_MS - 1).toISOString() })
    expect(await isFreshGoogleOnlyUser(admin, old, { now: NOW })).toBe(false)
    expect(await isFreshGoogleOnlyUser(admin, googleUser({ created_at: 'nonsense' }), { now: NOW })).toBe(false)
    const future = googleUser({ created_at: new Date(NOW + 10 * 60 * 1000).toISOString() })
    expect(await isFreshGoogleOnlyUser(admin, future, { now: NOW })).toBe(false)
  })

  it('isFreshGoogleOnlyUser is false when the user has a password identity', async () => {
    const { admin } = makeAdmin({})
    const merged = googleUser({ app_metadata: { provider: 'email', providers: ['email', 'google'] } })
    expect(await isFreshGoogleOnlyUser(admin, merged, { now: NOW })).toBe(false)
  })

  for (const table of ACTIVITY_TABLES) {
    it(`isFreshGoogleOnlyUser is false when ${table} has rows or errors`, async () => {
      const withRows = makeAdmin({ counts: { [table]: { count: 1, error: null } } })
      expect(await isFreshGoogleOnlyUser(withRows.admin, googleUser(), { now: NOW })).toBe(false)

      const withError = makeAdmin({ counts: { [table]: { count: null, error: { message: 'x' } } } })
      expect(await isFreshGoogleOnlyUser(withError.admin, googleUser(), { now: NOW })).toBe(false)

      const withNullCount = makeAdmin({ counts: { [table]: { count: null, error: null } } })
      expect(await isFreshGoogleOnlyUser(withNullCount.admin, googleUser(), { now: NOW })).toBe(false)
    })
  }

  it('isFreshGoogleOnlyUser requires at least one identity and every identity to be google', async () => {
    const { admin } = makeAdmin({})
    const withApple = googleUser({
      identities: [...(googleUser().identities ?? []), { provider: 'apple' } as never],
    })
    expect(await isFreshGoogleOnlyUser(admin, withApple, { now: NOW })).toBe(false)
    expect(await isFreshGoogleOnlyUser(admin, googleUser({ identities: [] }), { now: NOW })).toBe(false)
    expect(await isFreshGoogleOnlyUser(admin, googleUser({ identities: undefined }), { now: NOW })).toBe(false)
  })

  it('isFreshGoogleOnlyUser with profileMustBeMissing is false once a profile row exists', async () => {
    const present = makeAdmin({})
    expect(await isFreshGoogleOnlyUser(present.admin, googleUser(), { now: NOW, profileMustBeMissing: true })).toBe(false)
    const missing = makeAdmin({ usersRow: { data: null, error: null } })
    expect(await isFreshGoogleOnlyUser(missing.admin, googleUser(), { now: NOW, profileMustBeMissing: true })).toBe(true)
  })

  it('isFreshGoogleOnlyUser with requireNullConsent is false once consent is recorded', async () => {
    const consented = makeAdmin({
      usersRow: { data: { auth_provider: 'google', terms_accepted_at: '2026-10-20T11:59:00Z' }, error: null },
    })
    expect(await isFreshGoogleOnlyUser(consented.admin, googleUser(), { now: NOW, requireNullConsent: true })).toBe(false)
    const pending = makeAdmin({
      usersRow: { data: { auth_provider: 'google', terms_accepted_at: null }, error: null },
    })
    expect(await isFreshGoogleOnlyUser(pending.admin, googleUser(), { now: NOW, requireNullConsent: true })).toBe(true)
  })

  it('deleteFreshGoogleUserIfSafe deletes only a fresh google-only user', async () => {
    const fresh = makeAdmin({})
    expect(await deleteFreshGoogleUserIfSafe(fresh.admin, googleUser(), { now: NOW })).toEqual({ deleted: true })
    expect(fresh.deleteUser).toHaveBeenCalledWith('user-1')

    const active = makeAdmin({ counts: { xp_events: { count: 3, error: null } } })
    expect(await deleteFreshGoogleUserIfSafe(active.admin, googleUser(), { now: NOW })).toEqual({ deleted: false })
    expect(active.deleteUser).not.toHaveBeenCalled()

    const merged = makeAdmin({})
    const mergedUser = googleUser({ identities: [{ provider: 'email' } as never] })
    expect(await deleteFreshGoogleUserIfSafe(merged.admin, mergedUser, { now: NOW })).toEqual({ deleted: false })
    expect(merged.deleteUser).not.toHaveBeenCalled()
  })

  it('deleteFreshGoogleUserIfSafe never throws and reports a failed delete', async () => {
    const failing = makeAdmin({ deleteUser: async () => ({ error: { message: 'nope' } }) })
    expect(await deleteFreshGoogleUserIfSafe(failing.admin, googleUser(), { now: NOW })).toEqual({ deleted: false })

    const throwing = makeAdmin({
      deleteUser: async () => {
        throw new Error('network')
      },
    })
    expect(await deleteFreshGoogleUserIfSafe(throwing.admin, googleUser(), { now: NOW })).toEqual({ deleted: false })
  })
})

// ---------------------------------------------------------------------------
// signup-limits
// ---------------------------------------------------------------------------

describe('signup-limits', () => {
  it('exports the aggregate signup constants', () => {
    expect(SIGNUP_GLOBAL_LIMIT_KEY).toBe('signup_global')
    expect(AGGREGATE_SIGNUP_WINDOW_MS).toBe(60 * 60 * 1000)
    expect(AGGREGATE_SIGNUP_FLOOR).toBe(15)
  })

  it('derives an hourly ceiling from the daily email limit with a floor', () => {
    expect(aggregateSignupCeiling(100)).toBe(15)
    expect(aggregateSignupCeiling(2400)).toBe(100)
    expect(aggregateSignupCeiling(2401)).toBe(101)
    expect(aggregateSignupCeiling(0)).toBe(15)
    expect(aggregateSignupCeiling(Number.NaN)).toBe(15)
    expect(aggregateSignupCeiling(-5)).toBe(15)
  })
})
