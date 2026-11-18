import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Perf plan item 2: getServerUser verifies the access token with getClaims() (the check
 * proxy.ts already runs) and never calls getUser(), so an app page render does not wait
 * on a GoTrue round trip. CQ-10: it never refreshes the session either.
 */

const cookieState: { token: string | undefined } = { token: 'tok' }

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'sb-access-token' && cookieState.token ? { name, value: cookieState.token } : undefined,
  })),
  headers: vi.fn(() => new Headers()),
}))

const getClaims = vi.fn()
const getUser = vi.fn()
const refreshSession = vi.fn()
const createAuthenticatedServerClient = vi.fn((token: string) => {
  void token
  return { auth: { getClaims, getUser, refreshSession } }
})

vi.mock('@/lib/supabase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/supabase')>()),
  createAuthenticatedServerClient: (token: string) => createAuthenticatedServerClient(token),
}))

import { getServerUser } from '../auth'

const CLAIMS = {
  sub: 'usr_claims',
  email: 'learner@example.com',
  role: 'authenticated',
  aud: 'authenticated',
  iat: 1_800_000_000,
  app_metadata: { provider: 'google', onboarding_complete: true },
  user_metadata: { full_name: 'Lee Learner', quick_start_completed: true },
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieState.token = 'tok'
  getClaims.mockResolvedValue({ data: { claims: CLAIMS }, error: null })
})

describe('getServerUser (claims path)', () => {
  it('verifies with getClaims, never getUser or refreshSession, and builds the User callers read', async () => {
    const user = await getServerUser()

    expect(createAuthenticatedServerClient).toHaveBeenCalledWith('tok')
    expect(getClaims).toHaveBeenCalledWith('tok')
    expect(getUser).not.toHaveBeenCalled()
    expect(refreshSession).not.toHaveBeenCalled()
    expect(user).toMatchObject({
      id: 'usr_claims',
      email: 'learner@example.com',
      role: 'authenticated',
      aud: 'authenticated',
      app_metadata: { provider: 'google', onboarding_complete: true },
      user_metadata: { full_name: 'Lee Learner', quick_start_completed: true },
    })
    // Same rule as proxy.ts: a token with an email counts as confirmed.
    expect(user?.email_confirmed_at).toBeTruthy()
  })

  it('leaves email_confirmed_at unset when the token has no email', async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...CLAIMS, email: '' } }, error: null })
    const user = await getServerUser()
    expect(user?.email).toBeUndefined()
    expect(user?.email_confirmed_at).toBeUndefined()
  })

  it('returns null without calling Supabase when there is no access token', async () => {
    cookieState.token = undefined
    await expect(getServerUser()).resolves.toBeNull()
    expect(getClaims).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('returns null for an invalid or expired token', async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error('invalid JWT') })
    await expect(getServerUser()).resolves.toBeNull()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('returns null when the claims carry no subject', async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...CLAIMS, sub: undefined } }, error: null })
    await expect(getServerUser()).resolves.toBeNull()
  })

  it('rethrows DYNAMIC_SERVER_USAGE so Next can mark the route dynamic', async () => {
    const dynamic = Object.assign(new Error('Dynamic server usage: cookies'), { digest: 'DYNAMIC_SERVER_USAGE' })
    getClaims.mockRejectedValue(dynamic)
    await expect(getServerUser()).rejects.toBe(dynamic)
  })

  it('returns null when getClaims throws anything else', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    getClaims.mockRejectedValue(new Error('network down'))
    await expect(getServerUser()).resolves.toBeNull()
  })
})
