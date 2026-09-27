/**
 * Phase 4 — Re-cut the unit of work.
 *
 * Single source of truth for the Core / Deep-dive lesson structure. Imported by the
 * client lesson shell (rendering), the server theory-gate + quiz pipeline
 * (`lessons-db.ts`, `page.tsx`), and the Phase 4 test suites — so there is exactly one
 * definition of "what is Core", "how a quiz is sampled" and "how long Core takes to read".
 *
 * ── Product direction (revised) ──
 * Core is defined by LEARNING IMPORTANCE, not block type: it must be conceptually COMPLETE —
 * a learner should finish Core and understand the lesson's central concept without being
 * forced to open Deep-dive. Deep-dive enriches; it never repairs an incomplete Core. The
 * earlier "~7-minute" target is dropped — an honest 10–15 minute Core is fine; perceived
 * effort is lowered through UI/UX (reading progress, per-section cards, progressive
 * disclosure of the optional depth), not by evicting learning content.
 *
 *   Core       : heading · paragraph · learningObjectives · theory · mentalModel ·
 *                framework · commonMistakes · keyTakeaways · summary  (+ concept diagrams)
 *   Deep dive  : caseStudy · companyExample · realWorldPerspective · interviewPerspective ·
 *                cheatSheet · glossary · resources · connections
 *   Content-aware: mermaid — inherits the group of the content it accompanies (see below)
 *   Tabs       : quiz · flashcardDeck · reflection
 *
 * This corrects the first implementation, which pushed `framework`, `commonMistakes` and ALL
 * `mermaid` diagrams into Deep-dive purely by type — separating essential explanation and
 * concept-defining diagrams from the Core. Two mechanisms make the classification content-
 * aware and maintainable without a hand-authored 90-lesson list:
 *   • an explicit per-block `depth` override (`'core' | 'deepDive'`) that wins over any type
 *     default — so any individual block can be pinned either way when it is an exception;
 *   • content-aware diagram placement — a standalone `mermaid` inherits the group of the
 *     nearest preceding content block, so a diagram illustrating the theory/model/framework
 *     stays in Core while one attached to an optional case study rides along to Deep-dive.
 *
 * Every one of the 21 compiled block types is still classified exactly once — no orphans
 * (asserted by the corpus test). Reading estimates are honest and computed from real prose.
 */

import type { CompiledBlock, CompiledLesson, CompiledQuizQuestion } from '@/types'

// ─── Classification ───────────────────────────────────────────────────────────
//
// Phase 4 (revised direction): Core is defined by LEARNING IMPORTANCE, not merely by block
// type. Core must contain the complete conceptual foundation a learner needs to understand
// the lesson — essential theory, the mental model(s), the framework(s) that structure the
// concept, the diagrams that EXPLAIN the concept, the pitfalls that clarify it, and the
// takeaways. Deep-dive holds genuinely optional depth: extended/reinforcing examples,
// additional company cases, optional perspectives, reference and further reading.
//
// The classification is still deterministic and corpus-wide (no hand-authored 90-lesson
// list), but with two things the first implementation lacked:
//
//   1. An EXPLICIT PER-BLOCK OVERRIDE (`block.depth`). Any individual block can be pinned to
//      Core or Deep-dive regardless of its generic type — the maintainable escape hatch the
//      product requires ("an important block must be able to stay Core even if its type would
//      normally be Deep-dive", and vice-versa). Populated in source/compiler metadata when a
//      specific block is an exception; empty for the corpus today, which the improved
//      type-defaults already handle.
//   2. CONTENT-AWARE placement for diagrams. A standalone `mermaid` block is NOT forced to
//      Deep-dive by its type. It inherits the group of the content it accompanies (the nearest
//      preceding Core/Deep-dive block): a diagram that visualises the theory/model/framework
//      stays in Core; a diagram attached to an optional case study rides along to Deep-dive.
//      (Diagrams authored INLINE inside mentalModel/framework were always Core and still are.)
//
// The ~7-minute target is deliberately gone: Core keeps everything conceptually necessary and
// the honest estimate reflects that (Step 6). Perceived effort is lowered through UI/UX, not by
// evicting learning content.

export type BlockGroup = 'core' | 'deepDive' | 'quiz' | 'flashcards' | 'reflection'
export type BlockDepth = 'core' | 'deepDive'

/**
 * Content blocks that establish the concept — the conceptual foundation. Includes the
 * framework(s) and common-pitfalls that the first implementation wrongly pushed to Deep-dive.
 */
export const CORE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'heading',
  'paragraph',
  'learningObjectives',
  'theory',
  'mentalModel',
  'framework',
  'commonMistakes',
  'keyTakeaways',
  'summary',
])

/** Genuinely optional depth — reinforces or extends understanding, never establishes it. */
export const DEEP_DIVE_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'caseStudy',
  'companyExample',
  'realWorldPerspective',
  'interviewPerspective',
  'cheatSheet',
  'glossary',
  'resources',
  'connections',
])

/**
 * Types whose placement depends on the content they accompany rather than their type alone.
 * A standalone diagram belongs wherever the concept it illustrates lives.
 */
export const CONTENT_AWARE_BLOCK_TYPES: ReadonlySet<string> = new Set(['mermaid'])

/** Blocks that render in their own tab, not in the theory reading surface. */
export const TAB_BLOCK_TYPES: ReadonlySet<string> = new Set([
  'quiz',
  'flashcardDeck',
  'reflection',
])

/**
 * Single-block classification by explicit override then type default. Content-aware types
 * (mermaid) default to Core here — a diagram is treated as concept-supporting unless context
 * (see `classifyBlocks`) or an explicit `depth` says otherwise, which is the safe direction
 * given the product rule that essential diagrams must stay in Core. `other` is only returned
 * for an unknown type; the corpus test asserts that never happens for shipped content.
 */
export function classifyBlock(block: Pick<CompiledBlock, 'type' | 'depth'>): BlockGroup | 'other' {
  const t = block.type
  if (t === 'quiz') return 'quiz'
  if (t === 'flashcardDeck') return 'flashcards'
  if (t === 'reflection') return 'reflection'
  // Explicit per-block override wins over every type default.
  if (block.depth === 'core') return 'core'
  if (block.depth === 'deepDive') return 'deepDive'
  if (CORE_BLOCK_TYPES.has(t)) return 'core'
  if (DEEP_DIVE_BLOCK_TYPES.has(t)) return 'deepDive'
  if (CONTENT_AWARE_BLOCK_TYPES.has(t)) return 'core'
  return 'other'
}

/**
 * Context-aware classification of a whole block list. Identical to `classifyBlock` for every
 * type except the content-aware ones (mermaid), which inherit the group of the nearest
 * preceding Core/Deep-dive content block (defaulting to Core when none precedes them). An
 * explicit `block.depth` override still wins. Returned in authored order, one group per block.
 */
export function classifyBlocks(blocks: CompiledBlock[]): (BlockGroup | 'other')[] {
  const groups = blocks.map((b) => classifyBlock(b))
  let lastContentGroup: BlockGroup = 'core'
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const g = groups[i]
    const isContentAware = CONTENT_AWARE_BLOCK_TYPES.has(b.type) && b.depth == null
    if (isContentAware) {
      // Inherit the context established by the last real content block.
      groups[i] = lastContentGroup
    } else if (g === 'core' || g === 'deepDive') {
      lastContentGroup = g
    }
  }
  return groups
}

/** The Core content blocks, in authored order (context-aware). */
export function getCoreBlocks(blocks: CompiledBlock[]): CompiledBlock[] {
  const groups = classifyBlocks(blocks)
  return blocks.filter((_, i) => groups[i] === 'core')
}

/** The Deep-dive content blocks, in authored order (context-aware). Never hidden. */
export function getDeepDiveBlocks(blocks: CompiledBlock[]): CompiledBlock[] {
  const groups = classifyBlocks(blocks)
  return blocks.filter((_, i) => groups[i] === 'deepDive')
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
