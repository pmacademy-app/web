'use client'

import React, { useState } from 'react'
import { BookOpen, CheckSquare, Layers, Edit3 } from 'lucide-react'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import { cn } from '@/lib/utils'
import type { CompiledBlock } from '@/types'

type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

const TABS: Array<{ key: TabType; label: string; icon: React.ElementType }> = [
  { key: 'theory', label: 'Theory', icon: BookOpen },
  { key: 'quiz', label: 'Quiz', icon: CheckSquare },
  { key: 'flashcards', label: 'Flashcards', icon: Layers },
  { key: 'reflection', label: 'Reflection', icon: Edit3 },
]

/**
 * Mirrors the learner tab shell's block filtering (lesson-content.tsx):
 * theory = everything except quiz / flashcardDeck / reflection.
 */
function getBlocksForTab(blocks: CompiledBlock[], tab: TabType): CompiledBlock[] {
  if (tab === 'theory') {
    const EXCLUDED = new Set(['quiz', 'flashcardDeck', 'reflection'])
    return blocks.filter((b) => !EXCLUDED.has(b.type))
  }
  if (tab === 'quiz') return blocks.filter((b) => b.type === 'quiz')
  if (tab === 'flashcards') return blocks.filter((b) => b.type === 'flashcardDeck')
  if (tab === 'reflection') return blocks.filter((b) => b.type === 'reflection')
  return []
}

/**
 * Learner-facing lesson preview (spec §4.6).
 *
 * Renders the compiled block tree through the same `BlockTreeRenderer` the
 * learner shell uses, inside a framed "read-only" panel. `previewMode` is
 * threaded to the block tree so interactive blocks (quiz / flashcards) are
 * fully browsable but never submit progress or award XP.
 */
export function AdminLessonPreview({
  blocks,
  lessonId,
}: {
  blocks: Array<Record<string, unknown>>
  lessonId: string
}) {
  const [activeTab, setActiveTab] = useState<TabType>('theory')
  const typedBlocks = blocks as CompiledBlock[]
  const tabBlocks = getBlocksForTab(typedBlocks, activeTab)

  return (
    <AdminSection
      title="Learner Preview"
      icon={BookOpen}
      meta="Read-only"
      bodyClassName="space-y-3"
    >
      <div
        className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border w-fit"
        role="tablist"
        aria-label="Lesson content sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const hasContent = getBlocksForTab(typedBlocks, tab.key).length > 0
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`preview-tab-${tab.key}`}
              aria-selected={isActive}
              aria-controls={`preview-panel-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              disabled={!hasContent}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
                isActive
                  ? 'bg-admin-accent text-admin-accent-contrast'
                  : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        id={`preview-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`preview-tab-${activeTab}`}
        className="rounded-xl border border-admin-border bg-admin-bg/40 p-4 sm:p-6"
      >
        {tabBlocks.length === 0 ? (
          <AdminEmptyState
            icon={BookOpen}
            title={`No ${activeTab} content`}
            description={`This lesson has no ${activeTab} blocks to preview.`}
            className="py-10"
          />
        ) : (
          <BlockTreeRenderer blocks={tabBlocks} lessonId={lessonId} previewMode />
        )}
      </div>
    </AdminSection>
  )
}