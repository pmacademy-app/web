/**
 * Lesson tab helpers shared by the server page and the client lesson shell.
 *
 * No 'use client' directive and no React: page.tsx (a Server Component) calls these to pick
 * the blocks it renders on the server, and lesson-content.tsx uses the same rules for the
 * interactive tabs. Keeping them here (not in the client module) lets the server call them.
 */
import type { CompiledBlock, CompiledLesson } from '@/types'
import { getCoreBlocks, TAB_BLOCK_TYPES } from '@/lib/academy/lesson-structure'
import type { RecutVariant } from '@/lib/academy/experiment'

export type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

// Phase 4 (§4.1): under the `treatment` variant the theory surface renders only the Core
// blocks; the Deep-dive is rendered separately by <DeepDiveSection>. Under `control` the
// theory surface renders every non-tab block exactly as before, so the experiment's control
// arm is a faithful reproduction of the pre-Phase-4 lesson.
export function getBlocksForTab(
  blocks: CompiledBlock[],
  tab: TabType,
  variant: RecutVariant = 'control'
): CompiledBlock[] {
  if (tab === 'theory') {
    if (variant === 'treatment') {
      return getCoreBlocks(blocks)
    }
    // Control: everything except quiz, flashcardDeck, reflection (legacy behaviour).
    return blocks.filter((b) => !TAB_BLOCK_TYPES.has(b.type))
  }
  if (tab === 'quiz') {
    return blocks.filter((b) => b.type === 'quiz')
  }
  if (tab === 'flashcards') {
    return blocks.filter((b) => b.type === 'flashcardDeck')
  }
  if (tab === 'reflection') {
    return blocks.filter((b) => b.type === 'reflection')
  }
  return []
}

/**
 * Performance plan item 12: the theory and Deep-dive blocks are rendered on the server and
 * reach the browser as HTML, so the client shell only needs the blocks its interactive tabs
 * read (quiz, flashcard deck, reflection prompts). Returns a shallow copy with only those
 * top-level blocks; the input (a shared, cached compiled lesson) is never mutated.
 */
export function withInteractiveBlocksOnly<T extends Pick<CompiledLesson, 'blocks'>>(lesson: T): T {
  return { ...lesson, blocks: lesson.blocks.filter((b) => TAB_BLOCK_TYPES.has(b.type)) }
}
