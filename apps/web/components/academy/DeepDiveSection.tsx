'use client'

/**
 * Phase 4 — Deep Dive section.
 *
 * Renders the optional Deep-dive blocks beneath the Core lesson on the theory surface.
 * IMPLEMENTATION_PLAN.md §4.1 is emphatic that "Deep dive is visible and labelled — never
 * hidden. The risk is that learners read it as content removal." So this is presented as a
 * clearly labelled, obviously-available section with an honest time estimate — the collapse
 * is a progressive-disclosure affordance, not a way to bury content.
 *
 * Two deliberate behaviours:
 *   - The block tree is mounted only once the learner expands the section. That keeps the
 *     initial Core payload small (a Deep-dive averages a mermaid diagram + ~1,600 words) and
 *     — importantly — keeps the theory-engagement scroll gate measuring the Core surface,
 *     not the full historical lesson. Consuming the Deep-dive is never required to reach the
 *     quiz.
 *   - Expanding fires `onOpen` exactly once, so depth consumption is observable (GA4 +
 *     server marker) per §4.4 rather than assumed.
 */

import { useState, useCallback } from 'react'
import { BookMarked, ChevronDown } from 'lucide-react'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'
import { Button } from '@/components/ui/button'
import type { CompiledBlock } from '@/types'

interface DeepDiveSectionProps {
  blocks: CompiledBlock[]
  lessonId: string
  /** Honest reading estimate for the extended material, in minutes. */
  estimatedMinutes: number
  /** Fired once, the first time the learner opens the section. */
  onOpen?: () => void
}

export function DeepDiveSection({
  blocks,
  lessonId,
  estimatedMinutes,
  onOpen,
}: DeepDiveSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      if (next && !hasOpened) {
        setHasOpened(true)
        onOpen?.()
      }
      return next
    })
  }, [hasOpened, onOpen])

  if (!blocks || blocks.length === 0) return null

  return (
    <section className="mt-10 border-t border-border pt-8" aria-labelledby="deep-dive-heading">
      <Button
        variant="outline"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls="deep-dive-content"
        className="w-full h-auto justify-between gap-4 whitespace-normal rounded-xl border-primary/20 bg-primary/5 px-5 py-4 text-left hover:bg-primary/10"
      >
        <span className="flex items-center gap-3">
          <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <BookMarked className="h-4 w-4" />
          </span>
          <span className="space-y-0.5">
            <span className="block text-sm font-bold text-foreground">
              Deep Dive — optional extended material
            </span>
            <span className="block text-xs text-muted-foreground">
              Case studies, company examples, frameworks and references
              {estimatedMinutes > 0 ? ` · ~${estimatedMinutes} min` : ''}
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </Button>

      {expanded && (
        <div id="deep-dive-content" className="mt-6 animate-fade-in">
          <BlockTreeRenderer blocks={blocks} lessonId={lessonId} />
        </div>
      )}
    </section>
  )
}
