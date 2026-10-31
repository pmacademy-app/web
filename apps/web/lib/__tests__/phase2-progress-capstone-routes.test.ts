import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PublicError } from '@/lib/errors/public-error'

/**
 * Phase 2, T4: the lesson progress and capstone routes.
 *
 * CRIT1: a progress row makes a lesson count as opened, so PATCH must refuse a malformed id
 * and a locked lesson before it writes anything. CQ-11/CQ-12: typed writes, a conditional
 * update that never downgrades, a row in every answer, and schema-validated bodies. PROD-15:
 * lesson_started and capstone_submitted are recorded exactly once per real change. W1: the
 * capstone GET carries the caller's userId for the local draft key.
 */

const getAuthenticatedUserFromRequest = vi.fn()
const evaluatePersistentRateLimit = vi.fn()
const assertLessonAccessible = vi.fn()
const trackProductEvent = vi.fn()
const evaluateBadgesAfterXp = vi.fn()
const hasXpEvent = vi.fn()
const submitCapstoneAction = vi.fn()
const loadCapstoneSubmission = vi.fn()

vi.mock('@/lib/auth', () => ({
  getAuthenticatedUserFromRequest: (req: Request) => getAuthenticatedUserFromRequest(req),
}))

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: (key: string, opts: unknown) => evaluatePersistentRateLimit(key, opts),
}))

vi.mock('@/lib/monitoring/logger', () => ({
  logErrorReport: vi.fn(),
  logSystemError: vi.fn(),
}))

vi.mock('@/lib/academy/lessons-db', () => ({
  assertLessonAccessible: (...args: unknown[]) => assertLessonAccessible(...args),
}))

vi.mock('@/lib/events/product-events', () => ({
  trackProductEvent: (...args: unknown[]) => trackProductEvent(...args),
}))

vi.mock('@/lib/badges/evaluate-after-xp', () => ({
  evaluateBadgesAfterXp: (...args: unknown[]) => evaluateBadgesAfterXp(...args),
}))

vi.mock('@/lib/xp-service', () => ({
  hasXpEvent: (...args: unknown[]) => hasXpEvent(...args),
}))

vi.mock('@/lib/capstones-db', () => ({
  submitCapstoneAction: (...args: unknown[]) => submitCapstoneAction(...args),
  loadCapstoneSubmission: (...args: unknown[]) => loadCapstoneSubmission(...args),
}))

// ─── A recording Supabase fake ───────────────────────────────────────────────

interface RecordedQuery {
  table: string
  op: 'select' | 'upsert' | 'update' | 'insert' | 'delete'
  payload?: unknown
  options?: Record<string, unknown>
  filters: Array<[string, string, unknown]>
}

type QueryResult = { data: unknown; error: unknown }
type Responder = (query: RecordedQuery) => QueryResult

let queries: RecordedQuery[] = []
let respond: Responder = () => ({ data: null, error: null })

function makeBuilder(query: RecordedQuery) {
  const resolve = () => Promise.resolve(respond(query))
  const filter = (kind: string) => (column: string, value: unknown) => {
    query.filters.push([kind, column, value])
    return builder
  }
  const builder: Record<string, unknown> = {
    select: () => builder,
    upsert: (payload: unknown, options?: Record<string, unknown>) => {
      query.op = 'upsert'
      query.payload = payload
      query.options = options
      return builder
    },
    update: (payload: unknown) => {
      query.op = 'update'
      query.payload = payload
      return builder
    },
    insert: (payload: unknown) => {
      query.op = 'insert'
      query.payload = payload
      return builder
    },
    eq: filter('eq'),
    neq: filter('neq'),
    is: filter('is'),
    in: filter('in'),
    order: () => builder,
    limit: () => builder,
    maybeSingle: resolve,
    single: resolve,
    then: (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve().then(onFulfilled, onRejected),
  }
  return builder
}

const fakeClient = {
  from: (table: string) => {
    const query: RecordedQuery = { table, op: 'select', filters: [] }
    queries.push(query)
    return makeBuilder(query)
  },
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: () => fakeClient,
}))

const { GET: progressGet, PATCH: progressPatch } = await import(
  '../../app/api/v2/lessons/[lessonId]/progress/route'
)
const { POST: capstoneSubmitPost } = await import('../../app/api/capstones/[module]/submit/route')
const { GET: capstoneGet } = await import('../../app/api/capstones/[module]/route')

const USER_ID = '7d4c2f1e-3a5b-4c6d-8e9f-0a1b2c3d4e5f'
const LEARNER = { id: USER_ID, email: 'learner@prodily.app' }
const LESSON_ID = 'les_04ix6b'
const MODULE = 'foundations'

function progressRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: USER_ID,
    lesson_id: LESSON_ID,
    status: 'in_progress',
    theory_read_at: null,
    quiz_score: null,
    quiz_attempts: 0,
    xp_earned: 0,
    completed_at: null,
    deep_dive_opened_at: null,
    ...overrides,
  }
}

function patch(lessonId: string, body: unknown, raw = false) {
  const request = new Request(`https://prodily.app/api/v2/lessons/${lessonId}/progress`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
  return progressPatch(request, { params: Promise.resolve({ lessonId }) })
}

function submit(body: unknown, raw = false) {
  const request = new Request(`https://prodily.app/api/capstones/${MODULE}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ? (body as string) : JSON.stringify(body),
  })
  return capstoneSubmitPost(request, { params: Promise.resolve({ module: MODULE }) })
}

const writes = () => queries.filter((q) => q.op !== 'select')

beforeEach(() => {
  queries = []
  respond = () => ({ data: null, error: null })
  getAuthenticatedUserFromRequest.mockReset().mockResolvedValue(LEARNER)
  evaluatePersistentRateLimit.mockReset().mockResolvedValue({ success: true, remaining: 9, resetInMs: 1000 })
  assertLessonAccessible.mockReset().mockResolvedValue(undefined)
  trackProductEvent.mockReset().mockResolvedValue(true)
  evaluateBadgesAfterXp.mockReset().mockResolvedValue(undefined)
  hasXpEvent.mockReset().mockResolvedValue(false)
  submitCapstoneAction.mockReset()
  loadCapstoneSubmission.mockReset()
})

// ─── CRIT1: no progress row for a lesson the learner cannot open ─────────────

describe('PATCH /api/v2/lessons/[lessonId]/progress: access is checked before any write', () => {
  it('answers 403 for a locked lesson and writes nothing', async () => {
    assertLessonAccessible.mockRejectedValue(
      new PublicError('Complete the previous lesson to unlock this one.', { status: 403, code: 'LESSON_LOCKED' })
    )

    const res = await patch(LESSON_ID, { status: 'in_progress' })

    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('LESSON_LOCKED')
    expect(assertLessonAccessible).toHaveBeenCalledWith(fakeClient, USER_ID, LESSON_ID)
    expect(writes()).toEqual([])
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('also guards the deep-dive marker, which creates a row just the same', async () => {
    assertLessonAccessible.mockRejectedValue(
      new PublicError('Complete the previous lesson to unlock this one.', { status: 403, code: 'LESSON_LOCKED' })
    )

    const res = await patch(LESSON_ID, { deep_dive_opened: true })

    expect(res.status).toBe(403)
    expect(writes()).toEqual([])
  })

  it('answers 400 for a malformed lesson id without checking access or touching the database', async () => {
    for (const badId of ['lesson-7', 'les_../../etc', 'LES_ABC', 'les_']) {
      const res = await patch(badId, { status: 'in_progress' })
      expect(res.status).toBe(400)
    }

    expect(assertLessonAccessible).not.toHaveBeenCalled()
    expect(queries).toEqual([])
  })

  it('answers 400, not a 500 incident, for a body that is not JSON', async () => {
    const res = await patch(LESSON_ID, '{not json', true)

    expect(res.status).toBe(400)
    expect(writes()).toEqual([])
  })

  it('answers 400 for a body of the wrong shape', async () => {
    const res = await patch(LESSON_ID, { status: 'completed' })

    expect(res.status).toBe(400)
    expect(writes()).toEqual([])
  })
})

// ─── CQ-11 + PROD-15 ─────────────────────────────────────────────────────────

describe('PATCH /api/v2/lessons/[lessonId]/progress: conditional writes and lesson_started', () => {
  it('creates the row once, returns it, and records lesson_started', async () => {
    const created = progressRow()
    respond = (q) => (q.op === 'upsert' ? { data: [created], error: null } : { data: null, error: null })

    const res = await patch(LESSON_ID, { status: 'in_progress' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(created)
    const upsert = writes()[0]
    expect(upsert.options).toMatchObject({ onConflict: 'user_id,lesson_id', ignoreDuplicates: true })
    expect(upsert.payload).toEqual({ status: 'in_progress', user_id: USER_ID, lesson_id: LESSON_ID })
    expect(trackProductEvent).toHaveBeenCalledTimes(1)
    expect(trackProductEvent).toHaveBeenCalledWith('lesson_started', USER_ID, { lesson_id: LESSON_ID })
  })

  it('does not record a second lesson_started when the row already exists', async () => {
    respond = (q) => {
      if (q.op === 'upsert') return { data: [], error: null }
      if (q.op === 'update') return { data: progressRow(), error: null }
      return { data: null, error: null }
    }

    const res = await patch(LESSON_ID, { status: 'in_progress' })

    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('in_progress')
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('never downgrades a completed lesson and still answers with the row', async () => {
    const completed = progressRow({ status: 'completed', completed_at: '2026-10-29T10:00:00.000Z' })
    respond = (q) => {
      if (q.op === 'upsert') return { data: [], error: null }
      if (q.op === 'update') return { data: null, error: null }
      return { data: completed, error: null }
    }

    const res = await patch(LESSON_ID, { status: 'in_progress' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(completed)
    const update = writes().find((q) => q.op === 'update')!
    expect(update.payload).toEqual({ status: 'in_progress' })
    // The guard lives in the UPDATE itself, so a concurrent completion cannot be overwritten.
    expect(update.filters).toContainEqual(['neq', 'status', 'completed'])
    expect(update.filters).toContainEqual(['eq', 'user_id', USER_ID])
    expect(update.filters).toContainEqual(['eq', 'lesson_id', LESSON_ID])
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('sets the deep-dive marker only while it is null and returns the row on a repeat', async () => {
    const existing = progressRow({ deep_dive_opened_at: '2026-10-28T09:00:00.000Z' })
    respond = (q) => {
      if (q.op === 'upsert') return { data: [], error: null }
      if (q.op === 'update') return { data: null, error: null }
      return { data: existing, error: null }
    }

    const res = await patch(LESSON_ID, { deep_dive_opened: true })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(existing)
    const update = writes().find((q) => q.op === 'update')!
    expect(update.filters).toContainEqual(['is', 'deep_dive_opened_at', null])
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('reports a database fault as a 500 incident rather than a refusal', async () => {
    respond = (q) =>
      q.op === 'upsert' ? { data: null, error: new Error('connection reset') } : { data: null, error: null }

    const res = await patch(LESSON_ID, { status: 'in_progress' })

    expect(res.status).toBe(500)
    expect((await res.json()).errorId).toMatch(/^err_/)
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('GET still answers with a not_started row when none exists', async () => {
    const request = new Request(`https://prodily.app/api/v2/lessons/${LESSON_ID}/progress`)
    const res = await progressGet(request, { params: Promise.resolve({ lessonId: LESSON_ID }) })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'not_started', lesson_id: LESSON_ID, deep_dive_opened_at: null })
  })
})

// ─── CQ-12 + PROD-15 + ISSUE-23: capstone submit ─────────────────────────────

describe('POST /api/capstones/[module]/submit', () => {
  const submission = { id: 'sub-1', status: 'submitted', module_slug: MODULE, content: 'x' }

  it('records capstone_submitted with revision:false for a first submission and evaluates badges', async () => {
    respond = () => ({ data: null, error: null })
    hasXpEvent.mockResolvedValue(false)
    submitCapstoneAction.mockResolvedValue({ success: true, submission, xpEarned: 150, message: 'ok' })

    const res = await submit({ content: 'my capstone', reflectionContent: 'r', reflectionIsPublic: true, isPublic: false })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.submission).toEqual(submission)
    expect(submitCapstoneAction).toHaveBeenCalledWith(fakeClient, USER_ID, MODULE, 'my capstone', 'r', true, false)
    expect(trackProductEvent).toHaveBeenCalledTimes(1)
    expect(trackProductEvent).toHaveBeenCalledWith('capstone_submitted', USER_ID, { module: MODULE, revision: false })
    expect(evaluateBadgesAfterXp).toHaveBeenCalledWith(USER_ID)
  })

  it('records revision:true when a prior submission existed, and skips badges when no XP was awarded', async () => {
    respond = (q) =>
      q.table === 'capstone_submissions' ? { data: { status: 'draft' }, error: null } : { data: null, error: null }
    hasXpEvent.mockResolvedValue(true)
    submitCapstoneAction.mockResolvedValue({ success: true, submission, xpEarned: 0, message: 'ok' })

    const res = await submit({ content: 'revised capstone' })

    expect(res.status).toBe(200)
    expect(trackProductEvent).toHaveBeenCalledWith('capstone_submitted', USER_ID, { module: MODULE, revision: true })
    expect(evaluateBadgesAfterXp).not.toHaveBeenCalled()
  })

  it('records nothing for a repeat of an already submitted capstone', async () => {
    respond = (q) =>
      q.table === 'capstone_submissions' ? { data: { status: 'submitted' }, error: null } : { data: null, error: null }
    hasXpEvent.mockResolvedValue(true)
    submitCapstoneAction.mockResolvedValue({ success: true, submission, xpEarned: 0, message: 'Capstone already submitted.' })

    const res = await submit({ content: 'same capstone' })

    expect(res.status).toBe(200)
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('applies the defaults the old hand parser did for omitted optional fields', async () => {
    submitCapstoneAction.mockResolvedValue({ success: true, submission, xpEarned: 0 })

    await submit({ content: 'c' })

    expect(submitCapstoneAction).toHaveBeenCalledWith(fakeClient, USER_ID, MODULE, 'c', '', false, undefined)
  })

  it('answers 400 for a non-string content without calling the service', async () => {
    const res = await submit({ content: 42 })

    expect(res.status).toBe(400)
    expect(submitCapstoneAction).not.toHaveBeenCalled()
    expect(trackProductEvent).not.toHaveBeenCalled()
  })

  it('answers 400, not a 500 incident, for a body that is not JSON', async () => {
    const res = await submit('{oops', true)

    expect(res.status).toBe(400)
    expect(submitCapstoneAction).not.toHaveBeenCalled()
  })
})

// ─── W1: the capstone GET carries the userId the workspace keys its draft on ──

describe('GET /api/capstones/[module]', () => {
  it('includes the caller userId', async () => {
    loadCapstoneSubmission.mockResolvedValue({
      submission: null,
      reflection: null,
      status: 'unlocked',
      lessonsCompleted: 8,
      totalLessons: 10,
      requiredLessons: 8,
    })
    respond = (q) =>
      q.table === 'users'
        ? { data: { username: 'ada', is_portfolio_public: true }, error: null }
        : { data: null, error: null }

    const request = new Request(`https://prodily.app/api/capstones/${MODULE}`)
    const res = await capstoneGet(request, { params: Promise.resolve({ module: MODULE }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.userId).toBe(USER_ID)
    expect(body.userProfile).toEqual({ username: 'ada', isPortfolioPublic: true })
  })
})
