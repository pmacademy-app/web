'use client'

import { useState, useMemo } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { FAQ_ITEMS } from '@/config/content'
import { trackFAQExpand } from '@/lib/analytics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export function FAQExplorer() {
  const prefersReducedMotion = useReducedMotion()
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [searchQuery, setSearchQuery] = useState('')
  // The answer that is animating shut. It stays mounted until its collapse
  // transition ends, the way AnimatePresence kept an exiting child in the DOM.
  const [closingIndex, setClosingIndex] = useState<number | null>(null)
  // Like AnimatePresence initial={false}: the answer open on first paint does not
  // animate in; only answers opened by the user do.
  const [hasToggled, setHasToggled] = useState(false)

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return FAQ_ITEMS.map((item, idx) => ({ ...item, originalIndex: idx }))
    const query = searchQuery.toLowerCase()
    return FAQ_ITEMS.map((item, idx) => ({ ...item, originalIndex: idx })).filter(
      (item) =>
        item.question.toLowerCase().includes(query) ||
        item.answer.toLowerCase().includes(query),
    )
  }, [searchQuery])

  const toggleItem = (originalIndex: number) => {
    setHasToggled(true)
    setClosingIndex(prefersReducedMotion ? null : openIndex)
    if (openIndex === originalIndex) {
      setOpenIndex(null)
    } else {
      setOpenIndex(originalIndex)
      trackFAQExpand(originalIndex)
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Search Input ────────────────────────────────────────────────── */}
      <div className="relative max-w-xl">
        <Search
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search questions (e.g. certificate, free, timeline, PRDs)..."
          className="
            w-full pl-10 pr-10 py-3 bg-surface border border-border rounded-xl text-sm text-foreground
            placeholder:text-ink-muted shadow-2xs
            focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10
            transition-all
          "
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-0.5"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Accordion List ──────────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-14 px-6 bg-surface border border-dashed border-border rounded-2xl space-y-3">
          <p className="text-base font-semibold text-foreground">No questions found</p>
          <p className="text-sm text-ink-muted">
            No answers matched &quot;{searchQuery}&quot;. Try searching with a different term.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary-hover transition-colors mt-2"
          >
            Reset Search
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isOpen = openIndex === item.originalIndex

            return (
              <div
                key={item.question}
                className={cn(
                  'rounded-2xl border transition-all duration-180 bg-surface overflow-hidden',
                  isOpen
                    ? 'border-primary/40 shadow-xs'
                    : 'border-border hover:border-border-strong',
                )}
              >
                <button
                  type="button"
                  id={`faq-btn-${item.originalIndex}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-answer-${item.originalIndex}`}
                  onClick={() => toggleItem(item.originalIndex)}
                  className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="text-base sm:text-lg font-semibold text-foreground tracking-tight">
                    {item.question}
                  </span>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full border border-border flex items-center justify-center shrink-0 transition-transform duration-200',
                      isOpen ? 'rotate-180 bg-primary text-white border-transparent' : 'bg-background text-ink-muted',
                    )}
                  >
                    <ChevronDown size={16} />
                  </div>
                </button>

                {(isOpen || closingIndex === item.originalIndex) && (
                  <div
                    id={`faq-answer-${item.originalIndex}`}
                    role="region"
                    aria-labelledby={`faq-btn-${item.originalIndex}`}
                    data-state={isOpen ? 'open' : 'closed'}
                    inert={!isOpen}
                    onTransitionEnd={(e) => {
                      if (e.target === e.currentTarget && !isOpen) setClosingIndex(null)
                    }}
                    onTransitionCancel={(e) => {
                      if (e.target === e.currentTarget && !isOpen) setClosingIndex(null)
                    }}
                    className={cn(
                      // Height animates via grid rows (0fr to 1fr), the CSS stand-in for
                      // height: auto. @starting-style (`starting:`) gives the mount its
                      // collapsed first frame; browsers without it just show the answer.
                      'grid transition-[grid-template-rows,opacity] duration-220 ease-[cubic-bezier(0,0,0.2,1)]',
                      hasToggled && 'starting:grid-rows-[0fr] starting:opacity-0',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                      // No transition means @starting-style never applies: the answer just appears.
                      prefersReducedMotion && 'transition-none',
                      'motion-reduce:transition-none',
                    )}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="px-5 sm:px-6 pb-6 pt-1 text-sm sm:text-base text-ink-muted leading-relaxed border-t border-border/60">
                        {item.answer}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
