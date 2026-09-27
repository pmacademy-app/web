/**
 * Phase 4 — Re-cut the unit of work.
 *
 * Single source of truth for the Core / Deep-dive lesson structure. Imported by the
 * client lesson shell (rendering), the server theory-gate + quiz pipeline
 * (`lessons-db.ts`, `page.tsx`), and the Phase 4 test suites — so there is exactly one
 * definition of "what is Core", "how a quiz is sampled" and "how long Core takes to read".
 *
 * IMPLEMENTATION_PLAN.md §"Phase 4 — Re-cut the unit of work" (item 4.1) specifies the
 * classification by BLOCK TYPE, so it is deterministic and maintainable across the whole
 * 90-lesson corpus rather than hand-tuned per lesson:
 *
 *   Core       : learningObjectives · theory · mentalModel · keyTakeaways
 *   Deep dive  : caseStudy · companyExample · realWorldPerspective · interviewPerspective
 *                framework · cheatSheet · glossary · resources · connections
 *                commonMistakes · mermaid
 *
 * Three structural block types are not named by the plan because they are framing, not
 * content sections: `heading`, `paragraph` (the lesson intro/narrative around the theory)
 * and `summary` (a short recap). They are assigned to Core so the Core view reads as a
 * complete short lesson (intro → objectives → theory → model → takeaways → recap) rather
 * than opening mid-sentence. `quiz`, `flashcardDeck` and `reflection` are their own tabs
 * and belong to neither group. Every one of the 21 compiled block types is therefore
 * classified exactly once — there are no orphaned blocks (asserted by the corpus test).
 *
 * ── Discrepancy with the source documents (NON-NEGOTIABLE RULE 15) ──
 * The plan/blueprint target a "~7 min" Core. In the actual compiled corpus the single
 * `theory` block averages ~3,765 words (~19 min at 200 wpm) and Core-by-type totals
 * ~4,600 words (~23 min). A literal 7-minute Core is therefore NOT achievable by block
 * grouping — it would require subdividing the monolithic `theory` block, i.e. rewriting
 * curriculum, which Phase 4 explicitly forbids ("the markdown, the compiler and the
 * content pipeline are untouched"). Per Rule 15 we follow the documents' STRUCTURE
 * faithfully and report HONEST computed estimates; the 7-minute figure is an unresolved
 * content-authoring decision, not something to fake or hack. The `~40%` reduction the
 * split does deliver (Core drops the ~3,200 words of examples/case studies/frameworks) is
 * real and measured.
 */

import type { CompiledBlock, CompiledLesson, CompiledQuizQuestion } from '@/types'

// ─── Classification ───────────────────────────────────────────────────────────

export type BlockGroup = 'core' | 'deepDive' | 'quiz' | 'flashcards' | 'reflection'

/** Content blocks that make up the primary ~first-session Core experience. */
export const CORE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'learningObjectives',
  'theory',
  'mentalModel',
  'keyTakeaways',
  'summary',
])

/** Optional extended material — visible and labelled, never removed. */
export const DEEP_DIVE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'caseStudy',
  'companyExample',
  'realWorldPerspective',
  'interviewPerspective',
  'framework',
  'cheatSheet',
  'glossary',
  'resources',
  'connections',
  'commonMistakes',
  'mermaid',
])

/** Blocks that render in their own tab, not in the theory reading surface. */
export const TAB_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'quiz',
  'flashcardDeck',
  'reflection',
])

/**
 * Classifies a single block. `other` is only ever returned for a block type that is not
 * yet known here; the corpus test asserts this never happens for shipped content, so a new
 * block type added to the compiler surfaces as a test failure rather than silently landing
 * in (or out of) Core.
 */
export function classifyBlock(block: Pick<CompiledBlock, 'type'>): BlockGroup | 'other' {
  const t = block.type
  if (t === 'quiz') return 'quiz'
  if (t === 'flashcardDeck') return 'flashcards'
  if (t === 'reflection') return 'reflection'
  if (CORE_BLOCK_TYPES.has(t)) return 'core'
  if (DEEP_DIVE_BLOCK_TYPES.has(t)) return 'deepDive'
  return 'other'
}

/** The Core content blocks, in authored order. */
export function getCoreBlocks(blocks: CompiledBlock[]): CompiledBlock[] {
  return blocks.filter((b) => CORE_BLOCK_TYPES.has(b.type))
}

/** The Deep-dive content blocks, in authored order. Never hidden — rendered on demand. */
export function getDeepDiveBlocks(blocks: CompiledBlock[]): CompiledBlock[] {
  return blocks.filter((b) => DEEP_DIVE_BLOCK_TYPES.has(b.type))
}

// ─── Reading-time estimation ────────────────────────────────────────────────────

/**
 * 200 words/minute — deliberately conservative for study material, so the honest estimate
 * errs slightly LONG rather than overselling how short Core is (Step 6: "Do not fake the
 * estimate"). This is the one canonical reading-time algorithm; nothing else recomputes it.
 */
export const READING_WORDS_PER_MINUTE = 200

/**
 * Keys whose string values are identifiers / machine content / diagram source rather than
 * prose a human reads, and are excluded from the word count.
 */
const NON_PROSE_KEYS: ReadonlySet<string> = new Set([
  'blockId',
  'id',
  'type',
  'language',
  'source',
  'normalized',
  'code',
  'svg',
  'staticSvg',
  'difficulty',
  'tags',
  'correctAnswer',
  'objectivesTested',
  'relatedConcepts',
  'level',
  'ordered',
])

/** Whole subtrees that are not read as prose (rendered diagrams, theme metadata). */
const NON_PROSE_SUBTREES: ReadonlySet<string> = new Set(['diagram', 'authorTheme'])

function countWords(text: string): number {
  const m = text.trim().match(/\S+/g)
  return m ? m.length : 0
}

function collectWords(value: unknown, key?: string): number {
  if (value == null) return 0
  if (typeof value === 'string') {
    return key && NON_PROSE_KEYS.has(key) ? 0 : countWords(value)
  }
  if (Array.isArray(value)) {
    // Preserve the parent key so e.g. `options` (excluded) stays excluded per element.
    return value.reduce<number>((n, v) => n + collectWords(v, key), 0)
  }
  if (typeof value === 'object') {
    let n = 0
    for (const k of Object.keys(value as Record<string, unknown>)) {
      if (NON_PROSE_SUBTREES.has(k)) continue
      n += collectWords((value as Record<string, unknown>)[k], k)
    }
    return n
  }
  return 0
}

/**
 * Prose word count of a single block, recursing into `children` (theory/mentalModel/
 * caseStudy/etc. carry their text in nested child blocks) and prose-bearing arrays. Diagram
 * source and identifiers are excluded, so a `mermaid` block contributes ~0 reading words.
 */
export function countReadableWords(block: CompiledBlock): number {
  return collectWords(block)
}

/** Minutes to read a set of blocks, never less than 1 for a non-empty set. */
export function estimateReadingMinutes(blocks: CompiledBlock[]): number {
  const words = blocks.reduce((n, b) => n + countReadableWords(b), 0)
  if (words === 0) return 0
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE))
}

/** Honest Core reading estimate (minutes). Drives the theory-engagement gate. */
export function getCoreReadingMinutes(lesson: Pick<CompiledLesson, 'blocks'>): number {
  return estimateReadingMinutes(getCoreBlocks(lesson.blocks))
}

/** Honest Deep-dive reading estimate (minutes). */
export function getDeepDiveReadingMinutes(lesson: Pick<CompiledLesson, 'blocks'>): number {
  return estimateReadingMinutes(getDeepDiveBlocks(lesson.blocks))
}

/**
 * Total content reading estimate = Core + Deep-dive. Kept recoverable (Step 6) so a caller
 * can always show "X min Core, Y min extended, Z min total" from one algorithm rather than
 * mixing computed Core minutes with the authored full-lesson figure.
 */
export function getTotalReadingMinutes(lesson: Pick<CompiledLesson, 'blocks'>): number {
  return getCoreReadingMinutes(lesson) + getDeepDiveReadingMinutes(lesson)
}

// ─── Deterministic quiz sampling (5 of 15) ──────────────────────────────────────

/** The question bank size every lesson is authored with. */
export const QUIZ_POOL_EXPECTED_SIZE = 15
/** Questions presented per attempt (IMPLEMENTATION_PLAN.md §4.2). */
export const QUIZ_SAMPLE_SIZE = 5

/** cyrb53 — a small, fast, well-distributed string hash for seeding the PRNG. */
function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length
  let h2 = 0x41c6ce57 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** mulberry32 — deterministic PRNG seeded from the hash above. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deterministically samples `size` questions from a pool, seeded by `seed`.
 *
 * Chosen architecture (IMPLEMENTATION_PLAN.md §4.2, Step 4): sampling runs SERVER-SIDE in
 * the lesson RSC seeded by `"<userId>:<lessonId>"`, so:
 *   - the same learner always sees the same 5 for a given lesson — a reload is not a new
 *     quiz, and there is no client/server hydration mismatch (the server picks; the client
 *     renders exactly what it was given);
 *   - the full 15-question bank is preserved on disk and the server still validates every
 *     submitted answer against all 15 (`recordQuizAttemptAction`), so answer validation and
 *     completion semantics are unchanged;
 *   - different learners get different (overlapping) samples, so the other 10 questions
 *     serve as variety across the cohort and as review material, rather than being deleted.
 *
 * Order within the returned sample is preserved from the original pool order so the quiz
 * reads coherently; only the SELECTION is randomised. If the pool is smaller than `size`,
 * the whole pool is returned (defensive — the corpus test asserts 15 everywhere).
 */
export function sampleQuizQuestions<T>(
  pool: T[],
  seed: string,
  size: number = QUIZ_SAMPLE_SIZE
): T[] {
  if (!Array.isArray(pool) || pool.length <= size) return pool ?? []
  const rand = mulberry32(hashSeed(seed))
  // Partial Fisher-Yates over indices, then restore original ordering of the chosen set.
  const indices = pool.map((_, i) => i)
  for (let i = 0; i < size; i++) {
    const j = i + Math.floor(rand() * (indices.length - i))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  const chosen = indices.slice(0, size).sort((a, b) => a - b)
  return chosen.map((i) => pool[i])
}

/**
 * Returns a shallow-cloned lesson whose quiz block carries only the sampled questions, with
 * the original pool size recorded on the block as `questionPoolSize`. The source lesson
 * object is NOT mutated — it is served from a shared module/`unstable_cache`, so mutating it
 * would corrupt other requests. Non-treatment callers pass the lesson through unchanged.
 */
export function withSampledQuiz(
  lesson: CompiledLesson,
  seed: string,
  size: number = QUIZ_SAMPLE_SIZE
): CompiledLesson {
  let changed = false
  const blocks = lesson.blocks.map((b) => {
    if (b.type !== 'quiz') return b
    const questions = (b.questions ?? []) as CompiledQuizQuestion[]
    if (questions.length <= size) return b
    changed = true
    return {
      ...b,
      questions: sampleQuizQuestions(questions, seed, size),
      questionPoolSize: questions.length,
    }
  })
  return changed ? { ...lesson, blocks } : lesson
}

// ─── Corpus validation (Step 8) ─────────────────────────────────────────────────

export interface LessonStructureReport {
  lessonId: string
  valid: boolean
  issues: string[]
  coreBlockCount: number
  deepDiveBlockCount: number
  unclassifiedTypes: string[]
  quizPoolSize: number
  hasTheory: boolean
  coreReadingMinutes: number
  deepDiveReadingMinutes: number
}

/**
 * Structural audit of one lesson. Used by the corpus test to prove every lesson has a
 * meaningful Core and a non-empty Deep-dive, its quiz bank is intact, and no block type is
 * orphaned. It intentionally does NOT judge the ~7-min target (see the discrepancy note
 * above) — it judges structural coherence, which is what the split is responsible for.
 */
export function validateLessonStructure(lesson: CompiledLesson): LessonStructureReport {
  const issues: string[] = []
  const core = getCoreBlocks(lesson.blocks)
  const deep = getDeepDiveBlocks(lesson.blocks)

  const unclassified = [
    ...new Set(
      lesson.blocks.filter((b) => classifyBlock(b) === 'other').map((b) => b.type)
    ),
  ]

  const hasTheory = lesson.blocks.some((b) => b.type === 'theory')
  const quizBlock = lesson.blocks.find((b) => b.type === 'quiz')
  const quizPoolSize = quizBlock?.questions?.length ?? 0

  if (core.length === 0) issues.push('no Core blocks')
  if (!hasTheory) issues.push('missing theory block')
  if (deep.length === 0) issues.push('empty Deep-dive (Core would equal the whole lesson)')
  if (unclassified.length > 0) {
    issues.push(`unclassified block type(s): ${unclassified.join(', ')}`)
  }
  if (!quizBlock) issues.push('missing quiz block')
  else if (quizPoolSize !== QUIZ_POOL_EXPECTED_SIZE) {
    issues.push(`quiz pool is ${quizPoolSize}, expected ${QUIZ_POOL_EXPECTED_SIZE}`)
  }

  return {
    lessonId: lesson.id,
    valid: issues.length === 0,
    issues,
    coreBlockCount: core.length,
    deepDiveBlockCount: deep.length,
    unclassifiedTypes: unclassified,
    quizPoolSize,
    hasTheory,
    coreReadingMinutes: estimateReadingMinutes(core),
    deepDiveReadingMinutes: estimateReadingMinutes(deep),
  }
}
