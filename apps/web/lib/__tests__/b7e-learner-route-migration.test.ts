import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { PublicError } from '@/lib/errors/public-error'

/**
 * B7-E — the learner wave.
 *
 * Two things are being proved here, and they are different in kind.
 *
 * The first is that migrating ~38 routes onto `withRoute` did not quietly change
 * who may call them or what they may do — the actor policy, the abuse controls and
 * the ownership checks each route already had.
 *
 * The second is the part that is not a migration at all: two routes were trusting
 * a caller-supplied user id, and N-4's four unlimited authenticated writes now have
 * ceilings. Those are asserted directly, because a comment claiming they are fixed
 * is worth nothing.
 */

const getAuthenticatedUserFromRequest = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

const dismissAnnouncement = vi.fn()
const getActiveAnnouncementsForUser = vi.fn()

vi.mock('@/lib/admin/announcements-service', () => ({
  AnnouncementsService: {
    dismissAnnouncement: (id: string, userId: string) => dismissAnnouncement(id, userId),
    getActiveAnnouncementsForUser: (userId: string, cohortId?: string) =>
      getActiveAnnouncementsForUser(userId, cohortId),
  },
}))

const addFriend = vi.fn()

vi.mock('@/lib/leaderboard-db', () => ({
  addFriend: (...args: unknown[]) => addFriend(...args),
  removeFriend: vi.fn(),
  getFriendLeaderboard: vi.fn().mockResolvedValue([]),
  getWeeklyLeaderboard: vi.fn(),
  getCohortLeaderboard: vi.fn(),
  toggleLeaderboardOptIn: vi.fn(),
  getCohortsData: vi.fn(),
  toggleCohortMembership: vi.fn(),
}))

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    createServiceRoleClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { cohort_id: 'cohort-a' }, error: null }) }),
        }),
      }),
    }),
  }
})

const { POST: dismissPost } = await import('../../app/api/announcements/[id]/dismiss/route')
const { GET: activeGet } = await import('../../app/api/announcements/active/route')
const { POST: friendsPost } = await import('../../app/api/friends/route')
const { POST: capstoneSubmitPost } = await import('../../app/api/capstones/[module]/submit/route')

const LEARNER = { id: 'learner-self', email: 'self@prodily.app' }

beforeEach(() => {
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(LEARNER)
  dismissAnnouncement.mockReset().mockResolvedValue(undefined)
  getActiveAnnouncementsForUser.mockReset().mockResolvedValue([])
  addFriend.mockReset().mockResolvedValue({ message: 'added' })
})

// ─── Client-supplied identity is no longer trusted ───────────────────────────

describe('B7-E — the announcement routes no longer take identity from the caller', () => {
  it('dismisses for the session learner, not the userId in the body', async () => {
    const request = new Request('https://prodily.app/api/announcements/ann-1/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'someone-elses-id' }),
    })

    const res = await dismissPost(request, { params: Promise.resolve({ id: 'ann-1' }) })

    expect(res.status).toBe(200)
    expect(dismissAnnouncement).toHaveBeenCalledWith('ann-1', 'learner-self')
    expect(dismissAnnouncement).not.toHaveBeenCalledWith('ann-1', 'someone-elses-id')
  })

  it('does not write anything for a caller with no session', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(null)

    const request = new Request('https://prodily.app/api/announcements/ann-1/dismiss', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'someone-elses-id' }),
    })

    const res = await dismissPost(request, { params: Promise.resolve({ id: 'ann-1' }) })

    // Still a 200 acknowledgement, as before — but nothing is persisted.
    expect(res.status).toBe(200)
    expect(dismissAnnouncement).not.toHaveBeenCalled()
  })

  it('reads announcements for the session learner, not the userId in the query', async () => {
    const request = new Request(
      'https://prodily.app/api/announcements/active?userId=someone-elses-id&cohortId=cohort-z'
    )

    await activeGet(request)

    expect(getActiveAnnouncementsForUser).toHaveBeenCalledWith('learner-self', 'cohort-a')
  })

  it('returns an empty list to an anonymous caller rather than someone elses announcements', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(null)

    const request = new Request(
      'https://prodily.app/api/announcements/active?userId=someone-elses-id'
    )
    const res = await activeGet(request)

    expect(res.status).toBe(200)
    const body = await res.json()
    // B13-B added the pagination envelope to this route, so the body is a superset of
    // what it was. The B7-E guarantee is unchanged and is what is asserted: an
    // anonymous caller gets an empty list, and the service is never consulted with a
    // caller-supplied identity.
    expect(body.success).toBe(true)
    expect(body.announcements).toEqual([])
    expect(body.items).toEqual([])
    expect(getActiveAnnouncementsForUser).not.toHaveBeenCalled()
  })
})

// ─── Service-layer copy survives; driver text does not ───────────────────────

describe('B7-E — PublicError keeps user-facing copy without reopening N-3', () => {
  it('publishes a service refusal the learner is meant to read', async () => {
    addFriend.mockRejectedValue(
      new PublicError('Learner "ada" not found.', { status: 404, code: 'NOT_FOUND' })
    )

    const request = new Request('https://prodily.app/api/friends', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada' }),
    })
    const res = await friendsPost(request)
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toBe('Learner "ada" not found.')
    expect(body.code).toBe('NOT_FOUND')
  })

  it('replaces an ordinary exception with generic copy and an incident id', async () => {
    addFriend.mockRejectedValue(
      new Error('connect ECONNREFUSED postgresql://user:hunter2@db.internal:5432/app')
    )

    const request = new Request('https://prodily.app/api/friends', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'ada' }),
    })
    const res = await friendsPost(request)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).not.toContain('hunter2')
    expect(body.error).not.toContain('ECONNREFUSED')
    expect(body.errorId).toMatch(/^err_[0-9a-f]{16}$/)
  })
})

// ─── Ordering: authenticate before anything is revealed ──────────────────────

describe('B7-E — the capstone slug check runs behind authentication', () => {
  it('still answers 404 for a slug that does not exist, once authenticated', async () => {
    const request = new Request('https://prodily.app/api/capstones/not-a-module/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'x' }),
    })

    const res = await capstoneSubmitPost(request, {
      params: Promise.resolve({ module: 'not-a-module' }),
    })

    expect(res.status).toBe(404)
  })

  it('answers 401 to an unauthenticated caller for real and fake slugs alike', async () => {
    getAuthenticatedUserFromRequest.mockResolvedValue(null)

    const statuses: number[] = []
    for (const slug of ['not-a-module', 'foundations']) {
      const request = new Request(`https://prodily.app/api/capstones/${slug}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: 'x' }),
      })
      const res = await capstoneSubmitPost(request, { params: Promise.resolve({ module: slug }) })
      statuses.push(res.status)
    }

    // Identical answers, so the endpoint is not a slug oracle.
    expect(statuses).toEqual([401, 401])
  })
})

// ─── N-4 and the abuse controls, read off the source ─────────────────────────

const API_DIR = path.resolve(import.meta.dirname, '../../app/api')

function routeSource(relative: string): string {
  return readFileSync(path.join(API_DIR, relative), 'utf8')
}

describe('B7-E / N-4 — the unlimited authenticated writes now have ceilings', () => {
  const LIMITED = [
    'capstones/[module]/submit/route.ts',
    'capstones/[module]/draft/route.ts',
    'user/avatar/route.ts',
    'reflections/route.ts',
  ]

  for (const relative of LIMITED) {
    it(`${relative} declares a per-learner rate limit`, () => {
      const source = routeSource(relative)

      expect(source).toContain('rateLimit: [')
      // Keyed on the resolved actor, never on anything the caller supplies.
      expect(source).toContain("actor.kind === 'learner'")
      expect(source).toMatch(/limit: \d+/)
      expect(source).toMatch(/windowMs: /)
    })
  }

  it('routes the new limits through the existing limiter rather than a second one', () => {
    for (const relative of LIMITED) {
      const source = routeSource(relative)
      // `withRoute` owns the call into `evaluatePersistentRateLimit`; a route that
      // imported the limiter directly would be a parallel implementation.
      expect(source).not.toContain('evaluateRateLimit')
      expect(source).not.toContain('evaluatePersistentRateLimit')
    }
  })
})

describe('B7-E — the pre-existing abuse controls came through unchanged', () => {
  it('waitlist keeps its fail-closed trusted-IP bucket', () => {
    const source = routeSource('waitlist/route.ts')

    expect(source).toContain('failClosed: true')
    expect(source).toContain('getClientIpBucket(request)')
    // Not the caller-supplied header.
    expect(source).not.toContain('x-forwarded-for')
  })

  it('contact keeps its fail-closed bucket keyed on the learner or the trusted IP', () => {
    const source = routeSource('contact/route.ts')

    expect(source).toContain('failClosed: true')
    expect(source).toContain("actor.kind === 'learner' ? actor.userId : getClientIpBucket(request)")
  })

  it('feedback keeps the single shared anonymous bucket it shipped with', () => {
    const source = routeSource('feedback/route.ts')

    expect(source).toContain("'anon_feedback'")
    expect(source).toContain('limit: 5')
  })

  it('lesson progress keeps its 30-per-minute per-learner ceiling', () => {
    const source = routeSource('v2/lessons/[lessonId]/progress/route.ts')

    expect(source).toContain('`progress_${actor.userId}`')
    expect(source).toContain('limit: 30')
  })

  it('leaves the limiter ordering intact on every route that throttled before parsing', () => {
    // These four charged the bucket before touching the body. Declaring a `body`
    // schema would move validation in front of the limiter, so none of them may
    // have one.
    for (const relative of [
      'waitlist/route.ts',
      'contact/route.ts',
      'feedback/route.ts',
      'testimonials/route.ts',
      'v2/lessons/[lessonId]/progress/route.ts',
    ]) {
      expect(routeSource(relative)).not.toContain('    body: ')
    }
  })
})

// ─── Scope ───────────────────────────────────────────────────────────────────

describe('B7-E — migration scope', () => {
  function routeFiles(): string[] {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) walk(full)
        else if (entry === 'route.ts') hits.push(path.relative(API_DIR, full).split(path.sep).join('/'))
      }
    }
    walk(API_DIR)
    return hits.sort()
  }

  const LEARNER_GROUPS = [
    'badges', 'capstones', 'certificates', 'cohorts', 'feedback', 'flashcards',
    'friends', 'leaderboard', 'notifications', 'referrals', 'reflections', 'review',
    'skill-radar', 'streaks', 'v2', 'xp', 'user', 'announcements', 'contact',
    'fellow-requests', 'health', 'search-index', 'testimonials', 'waitlist',
  ]

  it('leaves no learner-facing route resolving the actor itself', () => {
    for (const file of routeFiles()) {
      const group = file.split('/')[0]
      if (!LEARNER_GROUPS.includes(group)) continue

      const source = readFileSync(path.join(API_DIR, file), 'utf8')
      expect(source).toContain('@/lib/api/with-route')
      expect(source).toContain('actor: { allow:')
      expect(source).not.toContain('requireAdminUser')
    }
  })

  it('states an explicit policy on every learner route, never an implicit default', () => {
    // `withRoute` has no default policy, but a route could still declare an
    // over-wide one by accident. Each of these is deliberately reachable without a
    // session and is listed so that widening any other route fails this test.
    const ANONYMOUS_BY_DESIGN = [
      'announcements/[id]/dismiss/route.ts',
      'announcements/active/route.ts',
      'contact/route.ts',
      'feedback/route.ts',
      'feedback/eligibility/route.ts',
      'health/route.ts',
      'referrals/resolve/route.ts',
      'search-index/route.ts',
      'testimonials/route.ts',
      'v2/lessons/[lessonId]/feedback/route.ts',
      'waitlist/route.ts',
    ]

    for (const file of routeFiles()) {
      const group = file.split('/')[0]
      if (!LEARNER_GROUPS.includes(group)) continue

      const source = readFileSync(path.join(API_DIR, file), 'utf8')
      if (source.includes("'anonymous'")) {
        expect(ANONYMOUS_BY_DESIGN).toContain(file)
      }
    }
  })
})
