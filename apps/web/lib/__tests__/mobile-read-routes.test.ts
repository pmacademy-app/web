/**
 * Read routes added for the mobile app: GET /api/curriculum, GET /api/lessons/[lessonId]
 * and GET /api/progress.
 *
 * The compiled content in content/dist is read for real; only the actor and the learner's
 * database rows are faked. The lesson route must never send a quiz answer or Mermaid
 * source, and must apply the same lesson gate as the web lesson page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { actorState, dbState } = vi.hoisted(() => ({
  actorState: { kind: 'learner' as 'learner' | 'anonymous', userId: 'mobile-reader-1' },
  dbState: {
    progress: [] as { lesson_id: string; status: string }[],
    user: { created_at: '2026-01-01T00:00:00Z', curriculum_access_override: false } as Record<string, unknown> | null,
  },
}))

vi.mock('@/lib/api/actor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/actor')>()
  return {
    ...actual,
    resolveActor: vi.fn(async (_request: Request, policy: { allow: string[] }) => {
      if (actorState.kind === 'anonymous') {
        return policy.allow.includes('anonymous')
          ? { ok: true, actor: { kind: 'anonymous' } }
          : { ok: false, status: 401, code: 'UNAUTHORIZED', reason: 'no session' }
      }
      return { ok: true, actor: { kind: 'learner', userId: actorState.userId, email: 'm@example.com' } }
    }),
  }
})

/** A minimal PostgREST-style builder: from(table).select().eq() awaited, or .maybeSingle(). */
function fakeDb() {
  return {
    from(table: string) {
      const result = () =>
        table === 'users'
          ? { data: dbState.user, error: null }
          : { data: dbState.progress.map((r) => ({ theory_read_at: null, quiz_score: null, quiz_attempts: 0, xp_earned: 0, completed_at: null, ...r })), error: null }
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      }
      return builder
    },
  }
}

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return { ...actual, getLearnerDbForRequest: vi.fn(async () => fakeDb()) }
})

import { GET as curriculumGET } from '../../app/api/curriculum/route'
import { GET as lessonGET } from '../../app/api/lessons/[lessonId]/route'
import { GET as progressGET } from '../../app/api/progress/route'
import { fetchCurriculumData } from '@/lib/lesson-loader'

const req = (path: string) => new NextRequest(`http://localhost${path}`, { headers: { Authorization: 'Bearer test' } })
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) })

beforeEach(() => {
  actorState.kind = 'learner'
  dbState.progress = []
  dbState.user = { created_at: '2026-01-01T00:00:00Z', curriculum_access_override: false }
})

async function firstLessons() {
  const curriculum = await fetchCurriculumData()
  return curriculum!.lessons
}

describe('GET /api/curriculum', () => {
  it('requires a signed-in learner', async () => {
    actorState.kind = 'anonymous'
    const res = await curriculumGET(req('/api/curriculum'), ctx())
    expect(res.status).toBe(401)
  })

  it('returns every module in order with titles and every lesson once', async () => {
    const lessons = await firstLessons()
    const res = await curriculumGET(req('/api/curriculum'), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.modules[0].slug).toBe('foundations')
    expect(body.modules[0].title.length).toBeGreaterThan(0)
    const ids = body.modules.flatMap((m: { lessons: { id: string }[] }) => m.lessons.map((l) => l.id))
    expect(ids).toEqual(lessons.map((l) => l.id))
    expect(body.totals).toEqual({ lessons: lessons.length, completed: 0 })
  })

  it('marks completed, unlocked and locked lessons from the learner rows', async () => {
    const lessons = await firstLessons()
    dbState.progress = [{ lesson_id: lessons[0].id, status: 'completed' }]
    const body = await (await curriculumGET(req('/api/curriculum'), ctx())).json()
    const first = body.modules[0].lessons
    expect(first[0].state).toBe('completed')
    expect(first[1].state).toBe('unlocked')
    expect(first[2].state).toBe('locked')
    expect(first[2].prerequisiteLessonId).toBe(lessons[1].id)
    expect(body.modules[0].completedCount).toBe(1)
  })
})

describe('GET /api/lessons/[lessonId]', () => {
  it('404s an id that is not a lesson id', async () => {
    const res = await lessonGET(req('/api/lessons/../etc'), ctx({ lessonId: '../etc' }))
    expect(res.status).toBe(404)
  })

  it('403s a locked lesson and names the lesson to complete first', async () => {
    const lessons = await firstLessons()
    const res = await lessonGET(req(`/api/lessons/${lessons[2].id}`), ctx({ lessonId: lessons[2].id }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('LESSON_LOCKED')
    // Module-entry unlock (treatment): the prerequisite is the previous lesson in the module.
    expect(body.prerequisiteLessonId).toBe(lessons[1].id)
  })

  it('serves an open lesson without quiz answers or Mermaid source', async () => {
    const lessons = await firstLessons()
    const id = lessons[0].id
    const res = await lessonGET(req(`/api/lessons/${id}`), ctx({ lessonId: id }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.lesson.id).toBe(id)
    expect(body.theoryBlocks.length).toBeGreaterThan(0)
    expect(body.progress.status).toBe('not_started')

    const raw = JSON.stringify(body)
    expect(raw).not.toContain('"correctAnswer"')
    expect(raw).not.toContain('"explanation"')
    expect(raw).not.toMatch(/"type":"mermaid","[^}]*"source"/)

    const quiz = body.interactiveBlocks.find((b: { type: string }) => b.type === 'quiz')
    expect(quiz.questions.length).toBeGreaterThan(0)
    for (const q of quiz.questions) expect(Object.keys(q).sort()).toEqual(expect.arrayContaining(['id', 'options', 'question']))
  })
})

describe('GET /api/progress', () => {
  it('counts completion over the curriculum and recommends the next lesson', async () => {
    const lessons = await firstLessons()
    dbState.progress = [
      { lesson_id: lessons[0].id, status: 'completed' },
      { lesson_id: lessons[1].id, status: 'in_progress' },
      { lesson_id: 'les_notreal', status: 'completed' },
    ]
    const res = await progressGET(req('/api/progress'), ctx())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.completion).toEqual({
      completed: 1,
      inProgress: 1,
      total: lessons.length,
      percentage: Math.round((1 / lessons.length) * 100),
    })
    expect(body.milestone.lessonId).toBe(lessons[1].id)
    expect(body.path.recommendedModule.slug.length).toBeGreaterThan(0)
  })
})
