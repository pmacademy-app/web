/**
 * Phase 4 — Re-cut the unit of work.
 *
 * Guards the behaviour described in docs/IMPLEMENTATION_PLAN.md §"Phase 4":
 *   4.1  Core / Deep-dive block classification (deterministic, corpus-wide, no orphans).
 *   4.2  5-of-15 quiz sampling — stable per (user, lesson), pool preserved.
 *   4.3  Honest Core / Deep-dive / total reading estimates.
 *   Step 5  Theory gate recomputes against Core reading time, not full-lesson time.
 *   Step 7  XP behaviour with a 5-question quiz (proportional; no rescale).
 *   Experiment  Deterministic A/B assignment, default control.
 *
 * These exercise the real shared module + the shipped lesson-shell helper, so the tests
 * track the code rather than a re-implementation.
 */

import { describe, it, expect } from 'vitest'
import {
  CORE_BLOCK_TYPES,
  DEEP_DIVE_BLOCK_TYPES,
  TAB_BLOCK_TYPES,
  QUIZ_POOL_EXPECTED_SIZE,
  QUIZ_SAMPLE_SIZE,
  classifyBlock,
  getCoreBlocks,
  getDeepDiveBlocks,
  estimateReadingMinutes,
  getCoreReadingMinutes,
  getDeepDiveReadingMinutes,
  getTotalReadingMinutes,
  countReadableWords,
  sampleQuizQuestions,
  withSampledQuiz,
  validateLessonStructure,
} from '@/lib/academy/lesson-structure'
import {
  getRecutVariant,
  getRecutExperimentConfig,
  isRecutTreatment,
} from '@/lib/academy/experiment'
import { getBlocksForTab } from '@/app/(app)/academy/[moduleSlug]/[lessonId]/lesson-content'
import { verifyTheoryReadEngagement, calculateQuizXp } from '@/lib/xp'
import type { CompiledBlock, CompiledLesson } from '@/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Accepts arbitrary block-specific fields (the real corpus uses shapes wider than the
// hand-written CompiledBlock optional-field types, e.g. interviewPerspective questions and
// resources items), matching the forward-compatible `[key: string]: unknown` catch-all.
const block = (type: string, extra: Record<string, unknown> = {}): CompiledBlock =>
  ({
    blockId: `b_${type}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    ...extra,
  }) as CompiledBlock

/** A lesson whose block sequence mirrors the real corpus (verified in reconnaissance). */
function makeLesson(overrides: Partial<CompiledLesson> = {}): CompiledLesson {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')
  const questions = Array.from({ length: 15 }, (_, i) => ({
    id: `q${i + 1}`,
    question: `Question ${i + 1}?`,
    options: ['A', 'B', 'C', 'D'],
    correctAnswer: i % 4,
    explanation: 'because',
    objectivesTested: [0],
    difficulty: 'medium' as const,
  }))
  return {
    schemaVersion: 2,
    id: 'les_test01',
    contentHash: 'hash',
    title: 'Test Lesson',
    slug: 'lesson-001',
    module: 'foundations',
    order: 1,
    totalInModule: 10,
    difficulty: 2,
    estimatedReadingTime: 30,
    estimatedCompletionTime: 40,
    prerequisites: [],
    sourceFile: 'x.md',
    blocks: [
      block('heading', { text: words(6) }),
      block('paragraph', { text: words(300) }),
      block('learningObjectives', { objectives: [words(20), words(20)] }),
      block('theory', {
        children: [block('paragraph', { text: words(2000) }), block('paragraph', { text: words(1500) })],
      }),
      block('commonMistakes', { mistakes: [{ title: words(5), body: words(250) }] }),
      block('mentalModel', { name: words(4), children: [block('paragraph', { text: words(90) })] }),
      block('mermaid', { source: words(1600), svg: words(500) }),
      block('companyExample', { company: 'Acme', children: [block('paragraph', { text: words(220) })] }),
      block('realWorldPerspective', { segments: [{ context: words(20), body: words(180) }] }),
      block('caseStudy', { title: words(4), children: [block('paragraph', { text: words(380) })] }),
      block('framework', { name: words(4), children: [block('paragraph', { text: words(80) })] }),
      block('interviewPerspective', { questions: [{ question: words(50), whatItEvaluates: words(120) }] }),
      block('summary', { children: [block('paragraph', { text: words(190) })] }),
      block('keyTakeaways', { items: [words(30), words(30), words(30)] }),
      block('cheatSheet', { items: [words(90)] }),
      block('glossary', { entries: [{ term: words(2), definition: words(90) }] }),
      block('resources', { items: [{ citation: words(40), note: words(15) }] }),
      block('flashcardDeck', { id: 'fd', cards: [{ id: 'c1', front: 'f', back: 'b', difficulty: 1, tags: [] }] }),
      block('reflection', { prompts: [words(30)] }),
      block('quiz', { id: 'quiz1', questions }),
      block('connections', {}),
    ],
    ...overrides,
  }
}

// ─── 4.1 — Classification ───────────────────────────────────────────────────

describe('4.1 — Core / Deep-dive classification', () => {
  it('places the plan-specified content blocks in Core', () => {
    for (const t of ['learningObjectives', 'theory', 'mentalModel', 'keyTakeaways']) {
      expect(classifyBlock({ type: t })).toBe('core')
      expect(CORE_BLOCK_TYPES.has(t)).toBe(true)
    }
  })

  it('places the plan-specified extended blocks in Deep-dive', () => {
    for (const t of [
      'caseStudy', 'companyExample', 'realWorldPerspective', 'interviewPerspective',
      'framework', 'cheatSheet', 'glossary', 'resources', 'connections', 'commonMistakes', 'mermaid',
    ]) {
      expect(classifyBlock({ type: t })).toBe('deepDive')
      expect(DEEP_DIVE_BLOCK_TYPES.has(t)).toBe(true)
    }
  })

  it('keeps quiz / flashcards / reflection as their own tabs, in neither content group', () => {
    expect(classifyBlock({ type: 'quiz' })).toBe('quiz')
    expect(classifyBlock({ type: 'flashcardDeck' })).toBe('flashcards')
    expect(classifyBlock({ type: 'reflection' })).toBe('reflection')
    for (const t of ['quiz', 'flashcardDeck', 'reflection']) {
      expect(CORE_BLOCK_TYPES.has(t)).toBe(false)
      expect(DEEP_DIVE_BLOCK_TYPES.has(t)).toBe(false)
      expect(TAB_BLOCK_TYPES.has(t)).toBe(true)
    }
  })

  it('classifies every block type in a corpus-shaped lesson (no orphans)', () => {
    const lesson = makeLesson()
    for (const b of lesson.blocks) {
      expect(classifyBlock(b)).not.toBe('other')
    }
  })

  it('splits a lesson into a non-empty Core and a non-empty Deep-dive', () => {
    const lesson = makeLesson()
    const core = getCoreBlocks(lesson.blocks)
    const deep = getDeepDiveBlocks(lesson.blocks)
    expect(core.length).toBeGreaterThan(0)
    expect(deep.length).toBeGreaterThan(0)
    // Core must not be the whole lesson: the heavy example material is deferred.
    expect(core.map((b) => b.type)).not.toContain('caseStudy')
    expect(deep.map((b) => b.type)).toContain('caseStudy')
  })
})

// ─── Rendering (getBlocksForTab) — no accidental full-lesson render ───────────

describe('Rendering — getBlocksForTab respects the variant', () => {
  const lesson = makeLesson()

  it('treatment theory tab renders ONLY Core (never the whole lesson)', () => {
    const rendered = getBlocksForTab(lesson.blocks, 'theory', 'treatment')
    const types = rendered.map((b) => b.type)
    expect(types).toContain('theory')
    expect(types).toContain('keyTakeaways')
    expect(types).not.toContain('caseStudy')
    expect(types).not.toContain('mermaid')
    expect(types).not.toContain('quiz')
    expect(rendered.length).toBe(getCoreBlocks(lesson.blocks).length)
  })

  it('control theory tab renders the full legacy block set (unchanged behaviour)', () => {
    const rendered = getBlocksForTab(lesson.blocks, 'theory', 'control')
    const types = rendered.map((b) => b.type)
    expect(types).toContain('caseStudy')
    expect(types).toContain('mermaid')
    // Still excludes the tab blocks, exactly as before Phase 4.
    expect(types).not.toContain('quiz')
    expect(types).not.toContain('flashcardDeck')
    expect(types).not.toContain('reflection')
  })

  it('defaults to control when no variant is given', () => {
    expect(getBlocksForTab(lesson.blocks, 'theory')).toEqual(
      getBlocksForTab(lesson.blocks, 'theory', 'control')
    )
  })
})

// ─── 4.2 — Quiz sampling ──────────────────────────────────────────────────────

describe('4.2 — 5-of-15 quiz sampling', () => {
  const pool = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}` }))

  it('selects exactly 5 questions from a 15-question pool', () => {
    const sample = sampleQuizQuestions(pool, 'user-1:les_x')
    expect(sample).toHaveLength(QUIZ_SAMPLE_SIZE)
    expect(QUIZ_SAMPLE_SIZE).toBe(5)
    expect(QUIZ_POOL_EXPECTED_SIZE).toBe(15)
  })

  it('is deterministic per (user, lesson) — a reload is not a new quiz', () => {
    const a = sampleQuizQuestions(pool, 'user-1:les_x')
    const b = sampleQuizQuestions(pool, 'user-1:les_x')
    expect(a).toEqual(b)
  })

  it('every sampled question comes from the source pool (valid sampling, no invention)', () => {
    const sample = sampleQuizQuestions(pool, 'user-7:les_y')
    const ids = new Set(pool.map((q) => q.id))
    for (const q of sample) expect(ids.has(q.id)).toBe(true)
    // No duplicates within a sample.
    expect(new Set(sample.map((q) => q.id)).size).toBe(sample.length)
  })

  it('gives different learners different samples (the other 10 are variety, not deleted)', () => {
    const a = sampleQuizQuestions(pool, 'user-1:les_x').map((q) => q.id)
    const b = sampleQuizQuestions(pool, 'user-2:les_x').map((q) => q.id)
    // Overwhelmingly likely to differ; the pool itself is untouched at 15 either way.
    expect(pool).toHaveLength(15)
    expect(a.join() !== b.join()).toBe(true)
  })

  it('preserves original question order within the sample (reads coherently)', () => {
    const sample = sampleQuizQuestions(pool, 'user-3:les_z')
    const order = sample.map((q) => pool.findIndex((p) => p.id === q.id))
    const sorted = [...order].sort((x, y) => x - y)
    expect(order).toEqual(sorted)
  })

  it('withSampledQuiz trims the quiz block to 5 while preserving the pool size, without mutating the source', () => {
    const lesson = makeLesson()
    const sampled = withSampledQuiz(lesson, 'user-1:les_test01')
    const sampledQuiz = sampled.blocks.find((b) => b.type === 'quiz')
    const originalQuiz = lesson.blocks.find((b) => b.type === 'quiz')
    expect(sampledQuiz?.questions).toHaveLength(5)
    expect(sampledQuiz?.questionPoolSize).toBe(15)
    // Source lesson (cached object) is untouched — still 15.
    expect(originalQuiz?.questions).toHaveLength(15)
  })
})

// ─── 4.3 + Step 6 — Reading-time estimates ────────────────────────────────────

describe('4.3 — honest reading-time estimates', () => {
  const lesson = makeLesson()

  it('Core estimate is smaller than the full lesson (the recut removed reading load)', () => {
    const core = getCoreReadingMinutes(lesson)
    const total = getTotalReadingMinutes(lesson)
    expect(core).toBeGreaterThan(0)
    expect(core).toBeLessThan(total)
  })

  it('Core + Deep-dive = total (total content time stays recoverable)', () => {
    expect(getCoreReadingMinutes(lesson) + getDeepDiveReadingMinutes(lesson)).toBe(
      getTotalReadingMinutes(lesson)
    )
  })

  it('excludes diagram source from reading time (a mermaid block reads as ~0 words)', () => {
    const mermaid = lesson.blocks.find((b) => b.type === 'mermaid')!
    expect(countReadableWords(mermaid)).toBe(0)
  })

  it('counts prose nested inside children (theory carries its text in child blocks)', () => {
    const theory = lesson.blocks.find((b) => b.type === 'theory')!
    expect(countReadableWords(theory)).toBeGreaterThan(3000)
  })

  it('empty block set estimates 0 minutes; any prose is at least 1 minute', () => {
    expect(estimateReadingMinutes([])).toBe(0)
    expect(estimateReadingMinutes([block('paragraph', { text: 'a few words here' })])).toBe(1)
  })
})

// ─── Step 5 — Theory gate against Core reading time ───────────────────────────

describe('Step 5 — theory gate uses Core reading time, not full-lesson time', () => {
  it('a shorter Core lowers the required dwell time versus the full lesson', () => {
    // Gate = max(45, estMinutes*60*0.2). A 30-min full lesson demands 360s; a ~12-min Core
    // demands ~144s — the learner is not made to dwell as if they read the Deep-dive too.
    const fullGateFailsAt = verifyTheoryReadEngagement(200, 90, 30)
    const coreGatePassesAt = verifyTheoryReadEngagement(200, 90, 12)
    expect(fullGateFailsAt.isEligible).toBe(false) // 200s < 360s required for the full lesson
    expect(coreGatePassesAt.isEligible).toBe(true) //  200s ≥ 144s required for Core
  })

  it('still enforces the 45s floor and 80% scroll for a very short Core', () => {
    expect(verifyTheoryReadEngagement(30, 100, 5).isEligible).toBe(false) // < 45s
    expect(verifyTheoryReadEngagement(60, 50, 5).isEligible).toBe(false) // < 80% scroll
    expect(verifyTheoryReadEngagement(60, 85, 5).isEligible).toBe(true)
  })
})

// ─── Step 7 — XP with a 5-question quiz ───────────────────────────────────────

describe('Step 7 — XP economy with the sampled quiz (no rescale)', () => {
  it('awards XP proportional to the questions answered (5 correct → 25 + perfect bonus)', () => {
    const res = calculateQuizXp(5, 5, true)
    expect(res.incrementalQuizXp).toBe(25) // 5 correct × 5 XP
    expect(res.perfectBonusXp).toBe(25) // first-attempt perfect on the 5-question quiz
    expect(res.totalXp).toBe(50)
  })

  it('does not double-award on a repeat attempt of the same lesson', () => {
    const first = calculateQuizXp(5, 5, true)
    const repeat = calculateQuizXp(5, 5, false, first.incrementalQuizXp)
    expect(repeat.incrementalQuizXp).toBe(0)
    expect(repeat.perfectBonusXp).toBe(0)
    expect(repeat.totalXp).toBe(0)
  })
})

// ─── Experiment assignment ────────────────────────────────────────────────────

describe('Experiment — deterministic A/B, default control', () => {
  it('is control for everyone when the flag is off (merge-to-main default)', () => {
    const cfg = getRecutExperimentConfig({} as NodeJS.ProcessEnv)
    expect(cfg.enabled).toBe(false)
    expect(getRecutVariant('user-1', cfg)).toBe('control')
    expect(getRecutVariant('user-2', cfg)).toBe('control')
  })

  it('is control for anonymous / sample-lesson viewers even when enabled', () => {
    const cfg = { enabled: true, treatmentPercent: 100 }
    expect(getRecutVariant(null, cfg)).toBe('control')
    expect(getRecutVariant(undefined, cfg)).toBe('control')
  })

  it('assigns a stable variant per user when enabled', () => {
    const cfg = { enabled: true, treatmentPercent: 50 }
    const v1 = getRecutVariant('user-abc', cfg)
    const v2 = getRecutVariant('user-abc', cfg)
    expect(v1).toBe(v2)
    expect(['control', 'treatment']).toContain(v1)
  })

  it('splits a population near the configured percentage', () => {
    const cfg = { enabled: true, treatmentPercent: 50 }
    let treatment = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (isRecutTreatment(`user-${i}`, cfg)) treatment++
    const ratio = treatment / N
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.6)
  })

  it('0% treats nobody, 100% treats everybody', () => {
    expect(getRecutVariant('u', { enabled: true, treatmentPercent: 0 })).toBe('control')
    expect(getRecutVariant('u', { enabled: true, treatmentPercent: 100 })).toBe('treatment')
  })
})

// ─── validateLessonStructure ──────────────────────────────────────────────────

describe('validateLessonStructure', () => {
  it('reports a corpus-shaped lesson as valid', () => {
    const report = validateLessonStructure(makeLesson())
    expect(report.valid).toBe(true)
    expect(report.issues).toEqual([])
    expect(report.hasTheory).toBe(true)
    expect(report.quizPoolSize).toBe(15)
  })

  it('flags a lesson whose Core would be the whole thing (empty Deep-dive)', () => {
    const lesson = makeLesson({
      blocks: [
        block('theory', { children: [block('paragraph', { text: 'x' })] }),
        block('quiz', { questions: Array.from({ length: 15 }, (_, i) => ({ id: `q${i}` })) as never }),
      ],
    })
    const report = validateLessonStructure(lesson)
    expect(report.valid).toBe(false)
    expect(report.issues.join(' ')).toMatch(/empty Deep-dive/)
  })

  it('flags an unknown block type as unclassified rather than silently dropping it', () => {
    const lesson = makeLesson()
    lesson.blocks.push(block('brandNewType', { text: 'hi' }))
    const report = validateLessonStructure(lesson)
    expect(report.unclassifiedTypes).toContain('brandNewType')
    expect(report.valid).toBe(false)
  })
})
