import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getAuthenticatedUserFromRequest = vi.fn()
const requireAdminUser = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: (req: Request) => requireAdminUser(req),
}))

const { resolveActor, ACTOR_KINDS } = await import('@/lib/api/actor')

const CRON_SECRET = 'cron-secret-value-for-tests'

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://prodily.app/api/anything', { headers })
}

const LEARNER = { id: 'user-1', email: 'learner@prodily.app' }

beforeEach(() => {
  getAuthenticatedUserFromRequest.mockReset()
  requireAdminUser.mockReset()
  getAuthenticatedUserFromRequest.mockResolvedValue(null)
  requireAdminUser.mockResolvedValue({ authorized: false, error: 'Authentication required', statusCode: 401 })
  process.env.CRON_SECRET = CRON_SECRET
})

afterEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
})

describe('B7-A — resolveActor: actor kinds', () => {
  it('resolves an anonymous actor when the policy allows it and no credential is present', async () => {
    const result = await resolveActor(req(), { allow: ['anonymous'] })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor).toEqual({ kind: 'anonymous' })
  })

  it('resolves a learner from an authenticated session', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const result = await resolveActor(req(), { allow: ['learner'] })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor).toEqual({
      kind: 'learner',
      userId: 'user-1',
      email: 'learner@prodily.app',
    })
  })

  it('resolves an admin through the existing guard, keeping its database re-read', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })

    const result = await resolveActor(req(), { allow: ['admin'] })

    expect(requireAdminUser).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    expect(result.ok && result.actor).toEqual({
      kind: 'admin',
      userId: 'admin-1',
      email: 'admin@prodily.app',
    })
  })

  it('resolves a cron actor from a matching bearer secret', async () => {
    const result = await resolveActor(req({ authorization: `Bearer ${CRON_SECRET}` }), { allow: ['cron'] })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor).toEqual({ kind: 'cron' })
  })

  it('accepts the Authorization header in either casing, as the cron routes do today', async () => {
    const result = await resolveActor(req({ Authorization: `Bearer ${CRON_SECRET}` }), { allow: ['cron'] })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor.kind).toBe('cron')
  })

  it('exposes the full set of actor kinds', () => {
    expect([...ACTOR_KINDS].sort()).toEqual(['admin', 'anonymous', 'cron', 'learner'])
  })
})

describe('B7-A — resolveActor: fail-closed behaviour', () => {
  it('denies with 401 when nothing matches and anonymous is not allowed', async () => {
    const result = await resolveActor(req(), { allow: ['learner'] })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.status).toBe(401)
    expect(!result.ok && result.code).toBe('UNAUTHORIZED')
  })

  it('denies with 403 when an authenticated non-admin hits an admin-only policy', async () => {
    requireAdminUser.mockResolvedValue({
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    })

    const result = await resolveActor(req(), { allow: ['admin'] })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.status).toBe(403)
    expect(!result.ok && result.code).toBe('FORBIDDEN')
  })

  it('never falls back to admin for an unrecognised credential', async () => {
    const result = await resolveActor(req({ authorization: 'Bearer not-the-cron-secret' }), {
      allow: ['cron', 'admin', 'learner', 'anonymous'],
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor.kind).toBe('anonymous')
  })

  it('refuses cron when CRON_SECRET is not configured, even with a bearer token present', async () => {
    delete process.env.CRON_SECRET

    const result = await resolveActor(req({ authorization: 'Bearer anything' }), { allow: ['cron'] })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.status).toBe(401)
  })

  it('refuses cron when CRON_SECRET is an empty string', async () => {
    process.env.CRON_SECRET = ''

    const result = await resolveActor(req({ authorization: 'Bearer ' }), { allow: ['cron'] })

    expect(result.ok).toBe(false)
  })

  it('rejects an empty allow list rather than defaulting to public', () => {
    // `allow: []` does not compile — ActorPolicy takes a non-empty tuple — so the
    // ts-expect-error below is itself part of the assertion. The runtime guard is
    // still required for a policy built dynamically or from untyped JavaScript,
    // and it throws synchronously: an empty policy is a programming error, not an
    // authorization outcome.
    // @ts-expect-error — an empty allow list is rejected by the type as well
    expect(() => resolveActor(req(), { allow: [] })).toThrow(/allow/i)
  })

  it('does not consult the auth helpers for a policy that does not allow those kinds', async () => {
    await resolveActor(req({ authorization: `Bearer ${CRON_SECRET}` }), { allow: ['cron'] })

    expect(requireAdminUser).not.toHaveBeenCalled()
    expect(getAuthenticatedUserFromRequest).not.toHaveBeenCalled()
  })
})

describe('B7-A — resolveActor: policy precedence', () => {
  it('prefers cron over a session when both are allowed and the secret matches', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const result = await resolveActor(req({ authorization: `Bearer ${CRON_SECRET}` }), {
      allow: ['cron', 'learner'],
    })

    expect(result.ok && result.actor.kind).toBe('cron')
  })

  it('falls through to learner when the admin check fails but learner is also allowed', async () => {
    requireAdminUser.mockResolvedValue({ authorized: false, statusCode: 403, error: 'not admin' })
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const result = await resolveActor(req(), { allow: ['admin', 'learner'] })

    expect(result.ok).toBe(true)
    expect(result.ok && result.actor.kind).toBe('learner')
  })

  it('prefers admin over learner when both are allowed and the user is an admin', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)

    const result = await resolveActor(req(), { allow: ['admin', 'learner'] })

    expect(result.ok && result.actor.kind).toBe('admin')
  })

  it('reproduces the cron-or-admin policy the six cron routes hand-roll today', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })

    const result = await resolveActor(req(), { allow: ['cron', 'admin'] })

    expect(result.ok && result.actor.kind).toBe('admin')
  })
})

describe('B7-A — resolveActor: memoization', () => {
  it('resolves once per request instance for the same policy', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })
    const request = req()

    const [a, b] = await Promise.all([
      resolveActor(request, { allow: ['admin'] }),
      resolveActor(request, { allow: ['admin'] }),
    ])

    expect(requireAdminUser).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('does not reuse one policy result for a different policy', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(LEARNER)
    const request = req()

    const learner = await resolveActor(request, { allow: ['learner'] })
    const anon = await resolveActor(request, { allow: ['anonymous'] })

    expect(learner.ok && learner.actor.kind).toBe('learner')
    expect(anon.ok && anon.actor.kind).toBe('anonymous')
  })

  it('treats allow-list order as irrelevant to the memoization key', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })
    const request = req()

    await resolveActor(request, { allow: ['admin', 'learner'] })
    await resolveActor(request, { allow: ['learner', 'admin'] })

    expect(requireAdminUser).toHaveBeenCalledTimes(1)
  })

  it('does not share resolution between two different requests', async () => {
    requireAdminUser.mockResolvedValue({ authorized: true, userId: 'admin-1', email: 'admin@prodily.app' })

    await resolveActor(req(), { allow: ['admin'] })
    await resolveActor(req(), { allow: ['admin'] })

    expect(requireAdminUser).toHaveBeenCalledTimes(2)
  })
})

describe('B7-A — resolveActor: cron secret comparison', () => {
  // `node:crypto`'s ESM namespace is not configurable, so the call cannot be spied
  // on. The delegation is pinned at the source instead: this is what stops the six
  // cron routes' plain `===` bearer comparison from reappearing here. The crypto
  // properties themselves belong to the shared helper and are asserted in
  // b7d-hook-secret-hardening.test.ts.
  it('delegates the cron comparison to the shared constant-time helper', async () => {
    const { readFileSync } = await import('node:fs')
    const path = await import('node:path')
    const source = readFileSync(path.resolve(import.meta.dirname, '../api/actor.ts'), 'utf8')

    expect(source).toContain("from '@/lib/security/constant-time'")

    const comparison = source.slice(source.indexOf('function isCron'), source.indexOf('function deny'))
    expect(comparison).toContain('secretsMatch')
    expect(comparison).not.toMatch(/[^=!<>]===[^=]/)
    expect(source).not.toContain('`Bearer ${')
  })

  it('rejects a secret that shares a prefix with the real one', async () => {
    const result = await resolveActor(req({ authorization: `Bearer ${CRON_SECRET.slice(0, -1)}` }), {
      allow: ['cron'],
    })

    expect(result.ok).toBe(false)
  })

  it('rejects a token that is longer than the real secret', async () => {
    const result = await resolveActor(req({ authorization: `Bearer ${CRON_SECRET}x` }), { allow: ['cron'] })

    expect(result.ok).toBe(false)
  })

  it('ignores a non-bearer Authorization scheme', async () => {
    const result = await resolveActor(req({ authorization: `Basic ${CRON_SECRET}` }), { allow: ['cron'] })

    expect(result.ok).toBe(false)
  })
})

describe('B7-A — requireUserId', () => {
  it('returns the id for the two actor kinds that carry one', async () => {
    const { requireUserId } = await import('@/lib/api/actor')

    expect(requireUserId({ kind: 'learner', userId: 'u1', email: null })).toBe('u1')
    expect(requireUserId({ kind: 'admin', userId: 'a1', email: 'a@b.c' })).toBe('a1')
  })

  it('throws for an actor kind that has no user id', async () => {
    const { requireUserId } = await import('@/lib/api/actor')

    // Unreachable under a learner- or admin-only policy; it exists so a route that
    // widens its policy without updating its handler fails loudly rather than
    // silently querying for an empty id.
    expect(() => requireUserId({ kind: 'anonymous' })).toThrow(/anonymous/)
    expect(() => requireUserId({ kind: 'cron' })).toThrow(/cron/)
  })
})

describe('B7-A — requireAdmin', () => {
  it('returns the id and email of an admin actor', async () => {
    const { requireAdmin } = await import('@/lib/api/actor')

    expect(requireAdmin({ kind: 'admin', userId: 'a1', email: 'a@b.c' })).toEqual({
      userId: 'a1',
      email: 'a@b.c',
    })
  })

  it('throws for any non-admin actor', async () => {
    const { requireAdmin } = await import('@/lib/api/actor')

    expect(() => requireAdmin({ kind: 'learner', userId: 'u1', email: 'u@b.c' })).toThrow(/learner/)
    expect(() => requireAdmin({ kind: 'anonymous' })).toThrow(/anonymous/)
    expect(() => requireAdmin({ kind: 'cron' })).toThrow(/cron/)
  })
})

describe('B7-A — resolveActor: learner shape', () => {
  it('carries a null email when the provider has none', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue({ id: 'user-2', email: undefined })

    const result = await resolveActor(req(), { allow: ['learner'] })

    expect(result.ok && result.actor).toEqual({ kind: 'learner', userId: 'user-2', email: null })
  })

  it('treats an authenticated user with no id as unauthenticated', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue({ id: '', email: 'x@y.z' })

    const result = await resolveActor(req(), { allow: ['learner'] })

    expect(result.ok).toBe(false)
  })
})
