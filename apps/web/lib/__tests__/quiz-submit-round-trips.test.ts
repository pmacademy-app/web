/**
 * Performance plan 2026-11-18, item 9: quiz submit round trips.
 *
 * The submit path used to wait on these, one after another:
 *   users.created_at -> [users.curriculum_access_override + progress] -> RPC -> flashcard upsert
 *   -> progress re-read
 * It now reads the users row once alongside the progress rows, counts completed lessons from
 * the rows the access check loaded, and enqueues flashcards after the response:
 *   [users + progress] -> RPC
 *
 * The fake database delays every query by one timer tick and records, for each query, how many
 * queries had finished when it started. Queries started together (Promise.all) share that
 * number, so the count of distinct numbers is the count of sequential round trips.
 *
 * The response values are checked against what the old code returned in every case: the fake
 * RPC writes the progress row the way the real RPC does, and the old code read that row back.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  afterTasks: [] as Array<() => Promise<unknown>>,
  dispatch: vi.fn(),
  streak: vi.fn(),
  referralCheck: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (task: () => Promise<unknown>) => {
    mocks.afterTasks.push(task)
  },
}))
vi.mock('@/lib/streaks-db', () => ({ updateUserStreak: mocks.streak }))
vi.mock('@/lib/referral/referral-service', () => ({ onFirstLessonCompletedReferralCheck: mocks.referralCheck }))
vi.mock('@/lib/notifications/dispatcher', () => ({ globalNotificationDispatcher: { dispatch: mocks.dispatch } }))
vi.mock('@/lib/notifications/events/connectors', () => ({ initializeNotificationConnectors: vi.fn() }))

import { getServedQuizQuestions, submitQuizAttempt } from '@/lib/academy/lessons-db'
import { getRuntimeXpValues, invalidateRuntimeXpCache } from '@/lib/xp'
import { readFileSync } from 'node:fs'
import path from 'node:path'

type Row = Record<string, unknown>
interface QueryLog {
  table: string
  op: string
  columns: string | null
  startedAfter: number
}

const USER = 'perf-learner-1'
const FIRST_LESSON = 'les_zoyq8a'
const LESSON = 'les_04ix6b'
const EARLIER_FOUNDATIONS = ['les_zoyq8a', 'les_prrl23', 'les_0q4aih']

type RpcShape = 'original' | 'mastery'

/** In-memory PostgREST stand-in with a per-query tick and a call log. */
function buildDb(tables: Record<string, Row[]>, rpcShape: RpcShape, failProgressReads = 0) {
  const log: QueryLog[] = []
  let finished = 0
  let progressFailuresLeft = failProgressReads

  const run = async <T>(entry: Omit<QueryLog, 'startedAfter'>, produce: () => T): Promise<T> => {
    log.push({ ...entry, startedAfter: finished })
    await new Promise((resolve) => setTimeout(resolve, 0))
    finished += 1
    return produce()
  }

  const client = {
    rpc: vi.fn((name: string, params: Record<string, unknown>) =>
      run({ table: `rpc:${name}`, op: 'rpc', columns: null }, () => {
        const lessonId = params.p_lesson_id as string
        const progress = (tables.user_lesson_progress ??= [])
        const existing = progress.find((r) => r.user_id === USER && r.lesson_id === lessonId)
        const wasCompleted = existing?.status === 'completed'
        const attemptsBefore = (existing?.quiz_attempts as number | undefined) ?? 0
        const passed = (params.p_score_percentage as number) >= 70

        // Original RPC: every attempt writes 'completed' and the envelope carries no status.
        // Mastery RPC: completes at 70 percent, never downgrades, and reports what it wrote.
        const newStatus = rpcShape === 'original' || wasCompleted || passed ? 'completed' : 'in_progress'
        if (existing) {
          existing.status = newStatus
          existing.quiz_attempts = attemptsBefore + 1
        } else {
          progress.push({ user_id: USER, lesson_id: lessonId, status: newStatus, quiz_attempts: 1 })
        }

        const envelope: Row = { success: true, total_xp_awarded: 10, is_first_attempt: attemptsBefore === 0 }
        if (rpcShape === 'mastery') {
          envelope.status = newStatus
          envelope.is_passed = newStatus === 'completed'
          envelope.is_newly_completed = newStatus === 'completed' && !wasCompleted
          envelope.best_score = params.p_score_percentage
        }
        return { data: envelope, error: null }
      })
    ),
    from: (table: string) => {
      const filters: [string, unknown][] = []
      let op = 'select'
      let columns: string | null = null
      const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v))
      const builder: Record<string, unknown> = {
        select: (cols?: string) => {
          if (op === 'select') columns = cols ?? '*'
          return builder
        },
        insert: () => ((op = 'insert'), builder),
        upsert: () => ((op = 'upsert'), builder),
        update: () => ((op = 'update'), builder),
        eq: (column: string, value: unknown) => {
          filters.push([column, value])
          return builder
        },
        maybeSingle: () => run({ table, op, columns }, () => ({ data: rows()[0] ?? null, error: null })),
        single: () => run({ table, op, columns }, () => ({ data: rows()[0] ?? null, error: null })),
        then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
          run({ table, op, columns }, () => {
            if (table === 'user_lesson_progress' && op === 'select' && progressFailuresLeft > 0) {
              progressFailuresLeft -= 1
              return { data: null, error: { message: 'progress read failed' } }
            }
            return { data: rows(), error: null }
          }).then(onFulfilled, onRejected),
      }
      return builder
    },
  }

  return { client, log }
}

function quizPool(lessonId: string) {
  const lesson = JSON.parse(
    readFileSync(path.resolve(process.cwd(), '..', '..', 'content', 'dist', 'lessons', `${lessonId}.json`), 'utf-8')
  ) as { blocks: { type: string; questions?: { id: string; correctAnswer: number }[] }[] }
  return lesson.blocks.find((b) => b.type === 'quiz')!.questions!
}

/** Every served question answered correctly, or every one answered wrong. */
function answers(lessonId: string, correct: boolean) {
  const pool = quizPool(lessonId)
  return getServedQuizQuestions(pool, USER, lessonId).map((q) => ({
    question_id: q.id,
    selected_option: correct ? q.correctAnswer : (q.correctAnswer + 1) % 4,
  }))
}

function seed(progress: { lesson_id: string; status: string; quiz_attempts?: number }[]) {
  return {
    users: [
      {
        id: USER,
        created_at: '2026-01-01T00:00:00.000Z',
        curriculum_access_override: false,
        email: 'perf@example.com',
        name: 'Perf Learner',
      },
    ],
    user_lesson_progress: progress.map((p) => ({ user_id: USER, quiz_attempts: 0, ...p })),
  } as Record<string, Row[]>
}

const completedEarlier = () => EARLIER_FOUNDATIONS.map((id) => ({ lesson_id: id, status: 'completed', quiz_attempts: 1 }))

/** Sequential round trips before the response, ignoring the (cached) XP settings read. */
function roundTrips(log: QueryLog[]) {
  return new Set(log.filter((q) => q.table !== 'system_settings').map((q) => q.startedAfter)).size
}

async function submit(
  lessonId: string,
  tables: Record<string, Row[]>,
  correct: boolean,
  rpcShape: RpcShape = 'original',
  failProgressReads = 0
) {
  const db = buildDb(tables, rpcShape, failProgressReads)
  // Warm the 30s XP settings cache, as on any instance that has served a request.
  invalidateRuntimeXpCache()
  await getRuntimeXpValues(db.client)
  db.log.length = 0
  const result = await submitQuizAttempt(db.client as never, USER, lessonId, answers(lessonId, correct))
  return { result, log: [...db.log], db }
}

beforeEach(() => {
  mocks.afterTasks.length = 0
  mocks.dispatch.mockReset().mockResolvedValue(undefined)
  mocks.streak.mockReset().mockResolvedValue(undefined)
  mocks.referralCheck.mockReset().mockResolvedValue({ rewarded: false })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('quiz submit round trips (item 9)', () => {
  it('answers after two sequential round trips: the access reads, then the RPC', async () => {
    const { log } = await submit(LESSON, seed(completedEarlier()), false)

    expect(roundTrips(log)).toBe(2)
    expect(log.map((q) => `${q.table}:${q.op}`)).toEqual([
      'users:select',
      'user_lesson_progress:select',
      'rpc:record_lesson_quiz_completion:rpc',
    ])
    // One users read carries every column the submit path needs.
    expect(log[0].columns).toContain('created_at')
    expect(log[0].columns).toContain('curriculum_access_override')
  })

  it('enqueues wrong-answer flashcards after the response, and reads no users row there', async () => {
    const { log, db } = await submit(LESSON, seed(completedEarlier()), false)
    expect(log.some((q) => q.table === 'user_flashcard_srs')).toBe(false)
    expect(mocks.afterTasks).toHaveLength(1)

    db.log.length = 0
    await mocks.afterTasks[0]()

    expect(db.log.filter((q) => q.table === 'user_flashcard_srs' && q.op === 'upsert')).toHaveLength(1)
    expect(db.log.filter((q) => q.table === 'users')).toHaveLength(0)
    const quizEvent = mocks.dispatch.mock.calls.map((c) => c[0] as Row).find((e) => e.event === 'quiz.completed')
    expect(quizEvent).toMatchObject({ userEmail: 'perf@example.com', userName: 'Perf Learner' })
  })
})

describe('quiz submit perfect bonus (quiz receipts)', () => {
  async function bonusSent(options?: { denyPerfectBonus?: boolean }) {
    const db = buildDb(seed(completedEarlier()), 'original')
    invalidateRuntimeXpCache()
    const xp = await getRuntimeXpValues(db.client)
    await submitQuizAttempt(db.client as never, USER, LESSON, answers(LESSON, true), options)
    const params = db.client.rpc.mock.calls[0][1] as Row
    return { sent: params.p_quiz_perfect_bonus_xp, configured: xp.QUIZ_PERFECT_BONUS }
  }

  it('passes the configured perfect bonus to the RPC by default', async () => {
    const { sent, configured } = await bonusSent()
    expect(configured).toBeGreaterThan(0)
    expect(sent).toBe(configured)
  })

  it('passes a zero perfect bonus when the route withholds it', async () => {
    const { sent } = await bonusSent({ denyPerfectBonus: true })
    expect(sent).toBe(0)
  })
})

describe('quiz submit completion counts match the progress the RPC wrote', () => {
  it('first completion of the very first lesson', async () => {
    const { result } = await submit(FIRST_LESSON, seed([]), true)
    expect(result).toMatchObject({ isNewlyCompleted: true, isFirstLesson: true, totalCompletedLessons: 1 })
  })

  it('first completion of a later lesson counts it with the earlier ones', async () => {
    const { result } = await submit(LESSON, seed(completedEarlier()), true)
    expect(result).toMatchObject({ isNewlyCompleted: true, isFirstLesson: false, totalCompletedLessons: 4 })
  })

  it('a retake of an already completed lesson does not count it twice', async () => {
    const tables = seed([...completedEarlier(), { lesson_id: LESSON, status: 'completed', quiz_attempts: 2 }])
    const { result } = await submit(LESSON, tables, true)
    expect(result).toMatchObject({ isNewlyCompleted: false, isFirstLesson: false, totalCompletedLessons: 4 })
  })

  it('a retake of the only completed lesson keeps isFirstLesson true, as before', async () => {
    const tables = seed([{ lesson_id: FIRST_LESSON, status: 'completed', quiz_attempts: 1 }])
    const { result } = await submit(FIRST_LESSON, tables, true)
    expect(result).toMatchObject({ isNewlyCompleted: false, isFirstLesson: true, totalCompletedLessons: 1 })
  })

  it('a failing attempt under the original RPC still completes the lesson, as the RPC writes it', async () => {
    const { result } = await submit(LESSON, seed(completedEarlier()), false, 'original')
    expect(result).toMatchObject({ totalCompletedLessons: 4, isFirstLesson: false })
  })

  it('a failing attempt under the mastery RPC does not count the lesson', async () => {
    const { result } = await submit(LESSON, seed(completedEarlier()), false, 'mastery')
    expect(result).toMatchObject({
      isPassed: false,
      isCompleted: false,
      isNewlyCompleted: false,
      totalCompletedLessons: 3,
      isFirstLesson: false,
    })
  })

  it('a failing first attempt on the first lesson under the mastery RPC counts zero', async () => {
    const { result } = await submit(FIRST_LESSON, seed([]), false, 'mastery')
    expect(result).toMatchObject({ isNewlyCompleted: false, isFirstLesson: false, totalCompletedLessons: 0 })
  })

  it('a failing retake of a completed lesson under the mastery RPC keeps it counted', async () => {
    const tables = seed([...completedEarlier(), { lesson_id: LESSON, status: 'completed', quiz_attempts: 1 }])
    const { result } = await submit(LESSON, tables, false, 'mastery')
    expect(result).toMatchObject({ isNewlyCompleted: false, isCompleted: true, totalCompletedLessons: 4 })
  })

  it('an earlier in-progress row with attempts is counted once the original RPC completes it', async () => {
    const tables = seed([...completedEarlier(), { lesson_id: LESSON, status: 'in_progress', quiz_attempts: 3 }])
    const { result } = await submit(LESSON, tables, true, 'original')
    // is_first_attempt is false here, so isNewlyCompleted falls back to false; the count still
    // includes the lesson because the RPC wrote 'completed'.
    expect(result).toMatchObject({ isNewlyCompleted: false, totalCompletedLessons: 4 })
  })

  it('falls back to reading progress after the RPC when the access check could not read it', async () => {
    // The first lesson is open without progress, so a failed read still passes the access check.
    const tables = seed([{ lesson_id: 'les_prrl23', status: 'completed', quiz_attempts: 1 }])
    const { result, log } = await submit(FIRST_LESSON, tables, true, 'original', 1)

    expect(roundTrips(log)).toBe(3)
    expect(log.at(-1)).toMatchObject({ table: 'user_lesson_progress', op: 'select' })
    expect(result).toMatchObject({ totalCompletedLessons: 2, isFirstLesson: false })
  })
})
