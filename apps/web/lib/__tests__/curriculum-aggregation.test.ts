import { describe, it, expect } from 'vitest'
import {
  buildCurriculumKpis,
  buildLessonOverviews,
  buildModuleCompletionStats,
  computeLessonCompletionPct,
  countFlashcards,
  countQuizQuestions,
  detectLessonTypes,
  getOrderedModuleSlugs,
  groupLessonsByModule,
} from '../admin/curriculum-aggregation'
import type { CompiledLesson, CurriculumEntry } from '@/types'

const lesson = (
  id: string,
  module: string,
  order: number,
  title = id
): CurriculumEntry => ({
  id,
  slug: id,
  title,
  module,
  order,
  difficulty: 1,
  estimatedReadingTime: 10,
  estimatedCompletionTime: 15,
  prerequisites: [],
})

const block = (type: string, extra: Record<string, unknown> = {}) => ({
  blockId: `b_${type}`,
  type,
  ...extra,
})

describe('Curriculum Workspace Aggregation Unit Test Suite', () => {
  it('detectLessonTypes returns theory for prose-only lessons', () => {
    const types = detectLessonTypes([block('heading'), block('paragraph'), block('summary')])
    expect(types).toEqual(['theory'])
  })

  it('detectLessonTypes returns quiz/flashcards/reflection in canonical order', () => {
    const types = detectLessonTypes([
      block('paragraph'),
      block('flashcardDeck'),
      block('quiz'),
      block('reflection'),
    ])
    expect(types).toEqual(['theory', 'quiz', 'flashcards', 'reflection'])
  })

  it('detectLessonTypes omits absent content types', () => {
    const types = detectLessonTypes([block('quiz'), block('paragraph')])
    expect(types).toEqual(['theory', 'quiz'])
  })

  it('countQuizQuestions sums questions across quiz blocks', () => {
    const blocks = [
      block('quiz', { questions: [{ id: 'q1' }, { id: 'q2' }] }),
      block('quiz', { questions: [{ id: 'q3' }] }),
      block('paragraph'),
    ]
    expect(countQuizQuestions(blocks)).toBe(3)
  })

  it('countFlashcards sums cards across flashcard decks', () => {
    const blocks = [
      block('flashcardDeck', { cards: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] }),
      block('flashcardDeck', { cards: [] }),
    ]
    expect(countFlashcards(blocks)).toBe(3)
  })

  it('getOrderedModuleSlugs orders modules by first lesson order', () => {
    const lessons = [
      lesson('les_b1', 'beta', 2),
      lesson('les_a1', 'alpha', 1),
      lesson('les_b2', 'beta', 3),
      lesson('les_a2', 'alpha', 4),
    ]
    expect(getOrderedModuleSlugs(lessons)).toEqual(['alpha', 'beta'])
  })

  it('groupLessonsByModule sorts each module by lesson order', () => {
    const lessons = [lesson('les_b', 'm', 2), lesson('les_a', 'm', 1)]
    const groups = groupLessonsByModule(lessons)
    expect(groups.get('m')?.map((l) => l.id)).toEqual(['les_a', 'les_b'])
  })

  it('buildCurriculumKpis counts modules, lessons, quizzes and flashcards', () => {
    const lessons = [lesson('les_a', 'm1', 1), lesson('les_b', 'm2', 1)]
    const compiled = [
      {
        id: 'les_a',
        blocks: [block('quiz', { questions: [{ id: 'q1' }, { id: 'q2' }] }), block('flashcardDeck', { cards: [{ id: 'c1' }] })],
      },
      {
        id: 'les_b',
        blocks: [block('quiz', { questions: [{ id: 'q3' }] })],
      },
    ] as unknown as Array<{ id: string; blocks: Array<Record<string, unknown>> }>

    const kpis = buildCurriculumKpis({ lessons, compiledLessons: compiled as never, capstoneCount: 9 })
    expect(kpis.modules).toBe(2)
    expect(kpis.lessons).toBe(2)
    expect(kpis.quizzes).toBe(3)
    expect(kpis.flashcards).toBe(1)
    expect(kpis.capstones).toBe(9)
  })

  it('buildModuleCompletionStats counts learners and per-lesson completions', () => {
    const lessons = [lesson('les_a', 'm1', 1), lesson('les_b', 'm1', 2), lesson('les_c', 'm2', 1)]
    const rows = [
      { lesson_id: 'les_a', user_id: 'u1' },
      { lesson_id: 'les_a', user_id: 'u2' },
      { lesson_id: 'les_b', user_id: 'u1' },
      { lesson_id: 'les_c', user_id: 'u1' },
    ]
    const stats = buildModuleCompletionStats(lessons, rows)

    const m1 = stats.get('m1')
    expect(m1).toBeDefined()
    expect(m1?.learnersStarted).toBe(2)
    expect(m1?.lessonCompletions.get('les_a')).toBe(2)
    expect(m1?.lessonCompletions.get('les_b')).toBe(1)

    const m2 = stats.get('m2')
    expect(m2).toBeDefined()
    expect(m2?.learnersStarted).toBe(1)
  })

  it('computeLessonCompletionPct clamps and handles zero starters', () => {
    expect(computeLessonCompletionPct(0, 0)).toBe(0)
    expect(computeLessonCompletionPct(5, 10)).toBe(50)
    expect(computeLessonCompletionPct(12, 10)).toBe(100)
  })

  it('buildLessonOverviews derives types, completions and completion pct', () => {
    const lessons = [lesson('les_a', 'm1', 1), lesson('les_b', 'm1', 2)]
    const rows = [
      { lesson_id: 'les_a', user_id: 'u1' },
      { lesson_id: 'les_a', user_id: 'u2' },
      { lesson_id: 'les_b', user_id: 'u1' },
    ]
    const stats = buildModuleCompletionStats(lessons, rows)
    const compiled = new Map<string, CompiledLesson>([
      ['les_a', { id: 'les_a', blocks: [block('quiz'), block('paragraph')] } as CompiledLesson],
    ])

    const overviews = buildLessonOverviews(lessons, stats, compiled)
    expect(overviews.length).toBe(2)

    const a = overviews.find((l) => l.id === 'les_a')
    expect(a).toBeDefined()
    expect(a?.types).toEqual(['theory', 'quiz'])
    expect(a?.completions).toBe(2)
    expect(a?.completionPct).toBe(100)
  })
})