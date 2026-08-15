import assert from 'node:assert'
import {
  buildCurriculumKpis,
  buildLessonOverviews,
  buildModuleCompletionStats,
  buildModuleOverviews,
  computeLessonCompletionPct,
  countFlashcards,
  countQuizQuestions,
  detectLessonTypes,
  getOrderedModuleSlugs,
  groupLessonsByModule,
} from '../admin/curriculum-aggregation'
import { CURRICULUM_MODULE_META } from '../admin/curriculum-meta'
import type { CompiledLesson, CurriculumEntry } from '@/types'

function runTest(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✕ ${name}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('🧪 Running Curriculum Workspace Aggregation Unit Test Suite...\n')

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

runTest('detectLessonTypes returns theory for prose-only lessons', () => {
  const types = detectLessonTypes([block('heading'), block('paragraph'), block('summary')])
  assert.deepStrictEqual(types, ['theory'])
})

runTest('detectLessonTypes returns quiz/flashcards/reflection in canonical order', () => {
  const types = detectLessonTypes([
    block('paragraph'),
    block('flashcardDeck'),
    block('quiz'),
    block('reflection'),
  ])
  assert.deepStrictEqual(types, ['theory', 'quiz', 'flashcards', 'reflection'])
})

runTest('detectLessonTypes omits absent content types', () => {
  const types = detectLessonTypes([block('quiz'), block('paragraph')])
  assert.deepStrictEqual(types, ['theory', 'quiz'])
})

runTest('countQuizQuestions sums questions across quiz blocks', () => {
  const blocks = [
    block('quiz', { questions: [{ id: 'q1' }, { id: 'q2' }] }),
    block('quiz', { questions: [{ id: 'q3' }] }),
    block('paragraph'),
  ]
  assert.strictEqual(countQuizQuestions(blocks), 3)
})

runTest('countFlashcards sums cards across flashcard decks', () => {
  const blocks = [
    block('flashcardDeck', { cards: [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }] }),
    block('flashcardDeck', { cards: [] }),
  ]
  assert.strictEqual(countFlashcards(blocks), 3)
})

runTest('getOrderedModuleSlugs orders modules by first lesson order', () => {
  const lessons = [
    lesson('les_b1', 'beta', 2),
    lesson('les_a1', 'alpha', 1),
    lesson('les_b2', 'beta', 3),
    lesson('les_a2', 'alpha', 4),
  ]
  assert.deepStrictEqual(getOrderedModuleSlugs(lessons), ['alpha', 'beta'])
})

runTest('groupLessonsByModule sorts each module by lesson order', () => {
  const lessons = [lesson('les_b', 'm', 2), lesson('les_a', 'm', 1)]
  const groups = groupLessonsByModule(lessons)
  assert.deepStrictEqual(
    groups.get('m')?.map((l) => l.id),
    ['les_a', 'les_b']
  )
})

runTest('buildCurriculumKpis counts modules, lessons, quizzes and flashcards', () => {
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
  assert.strictEqual(kpis.modules, 2)
  assert.strictEqual(kpis.lessons, 2)
  assert.strictEqual(kpis.quizzes, 3)
  assert.strictEqual(kpis.flashcards, 1)
  assert.strictEqual(kpis.capstones, 9)
})

runTest('buildModuleCompletionStats counts learners and per-lesson completions', () => {
  const lessons = [lesson('les_a', 'm1', 1), lesson('les_b', 'm1', 2), lesson('les_c', 'm2', 1)]
  const rows = [
    { lesson_id: 'les_a', user_id: 'u1' },
    { lesson_id: 'les_a', user_id: 'u2' },
    { lesson_id: 'les_b', user_id: 'u1' },
    { lesson_id: 'les_c', user_id: 'u1' },
  ]
  const stats = buildModuleCompletionStats(lessons, rows)

  const m1 = stats.get('m1')
  assert.ok(m1)
  assert.strictEqual(m1.learnersStarted, 2)
  assert.strictEqual(m1.lessonCompletions.get('les_a'), 2)
  assert.strictEqual(m1.lessonCompletions.get('les_b'), 1)

  const m2 = stats.get('m2')
  assert.ok(m2)
  assert.strictEqual(m2.learnersStarted, 1)
})

runTest('buildModuleCompletionStats ignores rows for unknown lessons', () => {
  const lessons = [lesson('les_a', 'm1', 1)]
  const stats = buildModuleCompletionStats(lessons, [
    { lesson_id: 'les_stale', user_id: 'u1' },
    { lesson_id: 'les_a', user_id: 'u1' },
  ])
  const m1 = stats.get('m1')
  assert.ok(m1)
  assert.strictEqual(m1.learnersStarted, 1)
  assert.strictEqual(m1.lessonCompletions.get('les_a'), 1)
})

runTest('computeLessonCompletionPct clamps and handles zero starters', () => {
  assert.strictEqual(computeLessonCompletionPct(0, 0), 0)
  assert.strictEqual(computeLessonCompletionPct(5, 10), 50)
  assert.strictEqual(computeLessonCompletionPct(12, 10), 100)
})

runTest('buildLessonOverviews derives types, completions and completion pct', () => {
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
  assert.strictEqual(overviews.length, 2)

  const a = overviews.find((l) => l.id === 'les_a')
  assert.ok(a)
  assert.deepStrictEqual(a.types, ['theory', 'quiz'])
  assert.strictEqual(a.completions, 2)
  assert.strictEqual(a.completionPct, 100)

  // Lesson without a compiled file falls back to theory-only.
  const b = overviews.find((l) => l.id === 'les_b')
  assert.ok(b)
  assert.deepStrictEqual(b.types, ['theory'])
  assert.strictEqual(b.completions, 1)
  assert.strictEqual(b.completionPct, 50)
})

runTest('buildLessonOverviews resolves per-lesson module stats across modules', () => {
  const lessons = [
    lesson('les_a1', 'alpha', 1),
    lesson('les_a2', 'alpha', 2),
    lesson('les_b1', 'beta', 1),
  ]
  const rows = [
    { lesson_id: 'les_a1', user_id: 'u1' },
    { lesson_id: 'les_a2', user_id: 'u1' },
    { lesson_id: 'les_b1', user_id: 'u1' },
  ]

  // Feed lessons spanning multiple modules through the same helpers — each
  // lesson must resolve its own module's stats (not the first module's).
  const stats = buildModuleCompletionStats(lessons, rows)
  const overviews = buildLessonOverviews(lessons, stats, new Map<string, never>())

  assert.strictEqual(overviews.length, 3)
  const a1 = overviews.find((l) => l.id === 'les_a1')
  const b1 = overviews.find((l) => l.id === 'les_b1')
  assert.ok(a1)
  assert.ok(b1)
  assert.strictEqual(a1.completionPct, 100)
  assert.strictEqual(b1.completionPct, 100)
  assert.strictEqual(a1.completions, 1)
  assert.strictEqual(b1.completions, 1)
})

runTest('buildModuleOverviews orders modules, numbers them and computes avg completion', () => {
  const lessons = [
    lesson('les_a1', 'alpha', 1),
    lesson('les_a2', 'alpha', 2),
    lesson('les_b1', 'beta', 1),
  ]
  const rows = [
    { lesson_id: 'les_a1', user_id: 'u1' },
    { lesson_id: 'les_a2', user_id: 'u1' },
    { lesson_id: 'les_b1', user_id: 'u1' },
  ]
  const stats = buildModuleCompletionStats(lessons, rows)
  const overviews = buildModuleOverviews(lessons, stats, CURRICULUM_MODULE_META)

  assert.strictEqual(overviews.length, 2)
  assert.deepStrictEqual(overviews.map((m) => m.slug), ['alpha', 'beta'])
  assert.strictEqual(overviews[0].number, 1)
  assert.strictEqual(overviews[1].number, 2)
  assert.strictEqual(overviews[0].lessonCount, 2)
  assert.strictEqual(overviews[0].learnersStarted, 1)
  assert.strictEqual(overviews[0].avgCompletionPct, 100)
  assert.strictEqual(overviews[1].avgCompletionPct, 100)
  assert.strictEqual(overviews[0].status, 'published')
})

runTest('buildModuleOverviews falls back to the slug for unknown module meta', () => {
  const lessons = [lesson('les_x', 'unknown', 1)]
  const stats = buildModuleCompletionStats(lessons, [])
  const overviews = buildModuleOverviews(lessons, stats, CURRICULUM_MODULE_META)
  assert.strictEqual(overviews.length, 1)
  assert.strictEqual(overviews[0].name, 'unknown')
  assert.strictEqual(overviews[0].description, '')
  assert.strictEqual(overviews[0].avgCompletionPct, 0)
})

runTest('curriculum module meta covers every curriculum module slug', () => {
  const slugs = ['foundations', 'discovery', 'strategy', 'execution', 'growth', 'leadership', 'technical', 'design', 'capstone']
  for (const slug of slugs) {
    assert.ok(CURRICULUM_MODULE_META[slug], `missing meta for ${slug}`)
  }
})