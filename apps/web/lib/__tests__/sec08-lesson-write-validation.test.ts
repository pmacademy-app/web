/**
 * SEC-08: learner write paths validate the content they write against before any write.
 *
 * - flashcard review: the card id must name a real card in a real lesson deck
 * - quiz submit: question ids unique, at most MAX_QUIZ_ATTEMPTS answers, scored against the
 *   quiz definition, on a lesson the learner can open
 * - theory read: an unknown or malformed lesson id is a 404, never a default estimate
 * - lesson access: assertLessonAccessible fails closed
 *
 * Lesson content is read from the real content/dist build (les_04ix6b is foundations #4, so a
 * learner with no progress cannot open it under either module-entry arm). The database is an
 * in-memory fake that records every table touched, so "rejected before any write" is checked.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { fakeDb, actorState } = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const fakeDb = {
    tables: {} as Record<string, Row[]>,
    touched: [] as { table: string; op: string }[],
    rpc: null as unknown as ReturnType<typeof vi.fn>,
    client: null as unknown,
  }
  const actorState = { userId: 'sec08-learner-1' }
  return { fakeDb, actorState }
})

/** A minimal chainable PostgREST stand-in: eq filters, maybeSingle, and a thenable result. */
function buildFakeClient() {
  const rpc = vi.fn(async () => ({ data: null, error: null }))
  fakeDb.rpc = rpc
  const client = {
    rpc,
    from: (table: string) => {
      const filters: [string, unknown][] = []
      let op = 'select'
      const rows = () =>
        (fakeDb.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const builder: Record<string, unknown> = {
        select: () => builder,
        insert: () => {
          op = 'insert'
          return builder
        },
        upsert: () => {
          op = 'upsert'
          return builder
        },
        update: () => {
          op = 'update'
          return builder
        },
        delete: () => {
          op = 'delete'
          return builder
        },
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return builder
        },
        maybeSingle: async () => {
          fakeDb.touched.push({ table, op })
          return { data: rows()[0] ?? null, error: null }
        },
        then: (onFulfilled: (v: unknown) => unknown) => {
          fakeDb.touched.push({ table, op })
          return Promise.resolve({ data: rows(), error: null }).then(onFulfilled)
        },
      }
      return builder
    },
  }
  fakeDb.client = client
  return client
}

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/supabase')>()
  return { ...actual, createServiceRoleClient: () => fakeDb.client }
})

vi.mock('@/lib/rate-limit', () => ({
  evaluatePersistentRateLimit: vi.fn(async () => ({ success: true, remaining: 10, resetInMs: 60_000 })),
  evaluateInMemoryRateLimit: vi.fn(() => ({ success: true, remaining: 10, resetInMs: 60_000 })),
}))

vi.mock('@/lib/api/actor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/actor')>()
  return {
    ...actual,
    resolveActor: vi.fn(async () => ({
      ok: true,
      actor: { kind: 'learner', userId: actorState.userId, email: 'sec08@example.com' },
    })),
  }
})

vi.mock('@/lib/lesson-loader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/lesson-loader')>()
  return { ...actual, fetchCurriculumData: vi.fn(actual.fetchCurriculumData) }
})

import { fetchCurriculumData } from '@/lib/lesson-loader'
import { resolveFlashcardLessonId } from '@/lib/flashcards-service'
import {
  assertLessonAccessible,
  getServedQuizQuestions,
  recordTheoryReadAction,
  scoreQuizSubmission,
  submitQuizAttempt,
} from '@/lib/academy/lessons-db'
import { MAX_QUIZ_ATTEMPTS } from '@/lib/academy/lesson-ids'
import { PublicError } from '@/lib/errors/public-error'
import { POST as quizPOST } from '../../app/api/v2/lessons/[lessonId]/quiz/route'
import { POST as theoryReadPOST } from '../../app/api/v2/lessons/[lessonId]/theory-read/route'

const LESSON = 'les_04ix6b'
const EARLIER_FOUNDATIONS = ['les_zoyq8a', 'les_prrl23', 'les_0q4aih']
const UNKNOWN_LESSON = 'les_doesnotexist0'

const compiledLesson = JSON.parse(
  readFileSync(path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons', `${LESSON}.json`), 'utf-8')
) as { blocks: { type: string; questions?: { id: string; correctAnswer: number }[] }[] }
const quizPool = compiledLesson.blocks.find((b) => b.type === 'quiz')!.questions!

const asClient = () => fakeDb.client as never

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('expected the promise to reject')
}

function postJson(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const writes = () => fakeDb.touched.filter((t) => t.op !== 'select')

beforeEach(() => {
  vi.clearAllMocks()
  buildFakeClient()
  fakeDb.touched = []
  fakeDb.tables = {
    users: [{ id: actorState.userId, created_at: '2026-01-01T00:00:00.000Z', curriculum_access_override: false }],
    user_lesson_progress: [],
  }
})

describe('SEC-08: flashcard id must name a real card', () => {
  it('resolves a real card to its own lesson', async () => {
    await expect(resolveFlashcardLessonId(`fc-${LESSON}-1`)).resolves.toBe(LESSON)
  })

  it('rejects a well-formed id whose card is not in the lesson deck', async () => {
    const err = await rejection(resolveFlashcardLessonId(`fc-${LESSON}-9999`))
    expect(err).toBeInstanceOf(PublicError)
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects a card in a lesson that does not exist', async () => {
    const err = await rejection(resolveFlashcardLessonId(`fc-${UNKNOWN_LESSON}-1`))
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('rejects an id outside the compiler format, including path-like ids', async () => {
    for (const id of ['made-up-card', 'fc-../../etc/passwd-1', `fc-${LESSON.toUpperCase()}-1`, '']) {
      const err = await rejection(resolveFlashcardLessonId(id))
      expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' })
    }
  })

  it('rejects a caller lessonId that disagrees with the card', async () => {
    const err = await rejection(resolveFlashcardLessonId(`fc-${LESSON}-1`, 'les_zoyq8a'))
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION' })
  })
})

describe('SEC-08: scoreQuizSubmission scores against the quiz definition', () => {
  const pool = [
    { id: 'q-les_x-1', correctAnswer: 0 },
    { id: 'q-les_x-2', correctAnswer: 1 },
    { id: 'q-les_x-3', correctAnswer: 2 },
    { id: 'q-les_x-4', correctAnswer: 3 },
  ]
  const served = pool.slice(0, 2)

  it('scores a complete served submission against the served quiz', () => {
    const result = scoreQuizSubmission(
      pool,
      served,
      [
        { question_id: 'q-les_x-1', selected_option: 0 },
        { question_id: 'q-les_x-2', selected_option: 3 },
      ],
      { requireComplete: true }
    )
    expect(result.correctCount).toBe(1)
    expect(result.totalQuestions).toBe(2)
    expect(result.validatedAttempts).toEqual([
      { question_id: 'q-les_x-1', selected_option: 0, is_correct: true },
      { question_id: 'q-les_x-2', selected_option: 3, is_correct: false },
    ])
  })

  it('ignores a client-supplied is_correct flag and uses the answer key', () => {
    const result = scoreQuizSubmission(
      pool,
      served,
      [{ question_id: 'q-les_x-2', selected_option: 0, is_correct: true } as never],
      { requireComplete: false }
    )
    expect(result.correctCount).toBe(0)
  })

  it('uses the definition size as the denominator, never the submitted count', () => {
    const partial = scoreQuizSubmission(pool, served, [{ question_id: 'q-les_x-1', selected_option: 0 }], {
      requireComplete: false,
    })
    expect(partial.totalQuestions).toBe(2)

    // An answer outside the served quiz widens the denominator to the full bank.
    const outside = scoreQuizSubmission(pool, served, [{ question_id: 'q-les_x-4', selected_option: 3 }], {
      requireComplete: false,
    })
    expect(outside.totalQuestions).toBe(4)
    expect(outside.correctCount).toBe(1)
  })

  it('accepts a complete full-bank submission when completeness is required', () => {
    const all = pool.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))
    const result = scoreQuizSubmission(pool, served, all, { requireComplete: true })
    expect(result).toMatchObject({ correctCount: 4, totalQuestions: 4 })
  })

  it('rejects an incomplete submission when completeness is required', () => {
    expect(() =>
      scoreQuizSubmission(pool, served, [{ question_id: 'q-les_x-1', selected_option: 0 }], {
        requireComplete: true,
      })
    ).toThrow(PublicError)
  })

  it('rejects a duplicated question_id', () => {
    const attempt = () =>
      scoreQuizSubmission(
        pool,
        served,
        [
          { question_id: 'q-les_x-1', selected_option: 0 },
          { question_id: 'q-les_x-1', selected_option: 0 },
        ],
        { requireComplete: false }
      )
    expect(attempt).toThrow('Each question can be answered only once per submission.')
  })

  it('rejects a question that is not in the bank', () => {
    expect(() =>
      scoreQuizSubmission(pool, served, [{ question_id: 'q-les_x-99', selected_option: 0 }], {
        requireComplete: false,
      })
    ).toThrow('The submission contains a question that is not in this quiz.')
  })

  it('rejects an empty submission', () => {
    expect(() => scoreQuizSubmission(pool, served, [], { requireComplete: false })).toThrow(PublicError)
  })
})

describe('SEC-08: quiz route bounds the body before any write', () => {
  const url = `http://localhost/api/v2/lessons/${LESSON}/quiz`
  const ctx = { params: Promise.resolve({ lessonId: LESSON }) }

  it(`rejects more than ${MAX_QUIZ_ATTEMPTS} answers with 400`, async () => {
    const attempts = Array.from({ length: MAX_QUIZ_ATTEMPTS + 1 }, (_, i) => ({
      question_id: `q-${LESSON}-${i + 1}`,
      selected_option: 0,
    }))
    const res = await quizPOST(postJson(url, { attempts }), ctx as never)
    expect(res.status).toBe(400)
    expect(fakeDb.touched).toEqual([])
    expect(fakeDb.rpc).not.toHaveBeenCalled()
  })

  it('rejects a duplicated question_id with 400', async () => {
    const attempts = [
      { question_id: `q-${LESSON}-1`, selected_option: 0 },
      { question_id: `q-${LESSON}-1`, selected_option: 1 },
    ]
    const res = await quizPOST(postJson(url, { attempts }), ctx as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Each question can be answered only once per submission.')
    expect(fakeDb.touched).toEqual([])
  })

  it('rejects a malformed question id with 400', async () => {
    const res = await quizPOST(
      postJson(url, { attempts: [{ question_id: '../../secret', selected_option: 0 }] }),
      ctx as never
    )
    expect(res.status).toBe(400)
    expect(fakeDb.touched).toEqual([])
  })

  it('rejects a malformed lesson id with 404', async () => {
    const res = await quizPOST(
      postJson(url, { attempts: [{ question_id: `q-${LESSON}-1`, selected_option: 0 }] }),
      { params: Promise.resolve({ lessonId: '..%2F..%2Fetc' }) } as never
    )
    expect(res.status).toBe(404)
    expect(fakeDb.touched).toEqual([])
  })
})

describe('SEC-08: theory-read rejects an unknown lesson id', () => {
  const body = { active_seconds: 3600, scroll_percentage: 100 }

  it('returns 404 at the route for a well-formed id with no compiled lesson, writing nothing', async () => {
    const res = await theoryReadPOST(
      postJson(`http://localhost/api/v2/lessons/${UNKNOWN_LESSON}/theory-read`, body),
      { params: Promise.resolve({ lessonId: UNKNOWN_LESSON }) } as never
    )
    expect(res.status).toBe(404)
    expect((await res.json()).code).toBe('NOT_FOUND')
    expect(writes()).toEqual([])
  })

  it('returns 404 at the route for a malformed id', async () => {
    const res = await theoryReadPOST(
      postJson('http://localhost/api/v2/lessons/x/theory-read', body),
      { params: Promise.resolve({ lessonId: 'LES_../../x' }) } as never
    )
    expect(res.status).toBe(404)
    expect(fakeDb.touched).toEqual([])
  })

  it('recordTheoryReadAction rejects an unknown or malformed id itself (no default estimate)', async () => {
    for (const id of [UNKNOWN_LESSON, '../lessons/les_04ix6b', 'les_04ix6b/../x']) {
      const err = await rejection(recordTheoryReadAction(asClient(), actorState.userId, id, 3600, 100))
      expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' })
    }
    expect(writes()).toEqual([])
  })

  it('recordTheoryReadAction rejects a locked lesson with 403 before the engagement gate', async () => {
    const err = await rejection(recordTheoryReadAction(asClient(), actorState.userId, LESSON, 0, 0))
    expect(err).toMatchObject({ status: 403, code: 'LESSON_LOCKED' })
    expect(writes()).toEqual([])
  })
})

describe('SEC-08: locked lessons and assertLessonAccessible', () => {
  it('rejects a lesson the learner cannot open with 403 LESSON_LOCKED', async () => {
    const err = await rejection(assertLessonAccessible(asClient(), actorState.userId, LESSON))
    expect(err).toBeInstanceOf(PublicError)
    expect(err).toMatchObject({ status: 403, code: 'LESSON_LOCKED' })
  })

  it('allows the lesson once every earlier lesson is completed', async () => {
    fakeDb.tables.user_lesson_progress = EARLIER_FOUNDATIONS.map((lesson_id) => ({
      user_id: actorState.userId,
      lesson_id,
      status: 'completed',
    }))
    await expect(assertLessonAccessible(asClient(), actorState.userId, LESSON)).resolves.toBeUndefined()
  })

  it('keeps an already-opened lesson writable (retakes and review)', async () => {
    fakeDb.tables.user_lesson_progress = [{ user_id: actorState.userId, lesson_id: LESSON, status: 'in_progress' }]
    await expect(assertLessonAccessible(asClient(), actorState.userId, LESSON)).resolves.toBeUndefined()
  })

  it('rejects a well-formed lesson id that is not in the curriculum with 404', async () => {
    const err = await rejection(assertLessonAccessible(asClient(), actorState.userId, UNKNOWN_LESSON))
    expect(err).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('fails closed when curriculum.json is unavailable', async () => {
    vi.mocked(fetchCurriculumData).mockResolvedValueOnce(null)
    const err = await rejection(assertLessonAccessible(asClient(), actorState.userId, LESSON))
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(PublicError)
    expect((err as Error).message).toContain('curriculum.json is unavailable')
  })

  it('fails closed when the profile read errors', async () => {
    const client = fakeDb.client as { from: (t: string) => unknown }
    const realFrom = client.from
    client.from = (table: string) => {
      if (table !== 'users') return realFrom(table)
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        maybeSingle: async () => ({ data: null, error: new Error('db down') }),
      }
      return b
    }
    await expect(assertLessonAccessible(asClient(), actorState.userId, LESSON)).rejects.toThrow('db down')
  })

  it('submitQuizAttempt rejects a complete, valid submission on a locked lesson before any write', async () => {
    const served = getServedQuizQuestions(quizPool, actorState.userId, LESSON)
    const attempts = served.map((q) => ({ question_id: q.id, selected_option: q.correctAnswer }))

    const err = await rejection(submitQuizAttempt(asClient(), actorState.userId, LESSON, attempts))
    expect(err).toMatchObject({ status: 403, code: 'LESSON_LOCKED' })
    expect(fakeDb.rpc).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it('submitQuizAttempt rejects an incomplete submission with 400 before checking access', async () => {
    const err = await rejection(
      submitQuizAttempt(asClient(), actorState.userId, LESSON, [
        { question_id: quizPool[0].id, selected_option: quizPool[0].correctAnswer },
      ])
    )
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION' })
    expect(fakeDb.touched).toEqual([])
    expect(fakeDb.rpc).not.toHaveBeenCalled()
  })
})
