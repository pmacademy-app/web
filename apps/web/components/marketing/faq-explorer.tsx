'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Search, X } from 'lucide-react'
import { FAQ_ITEMS } from '@/config/content'
import { trackFAQExpand } from '@/lib/analytics'
import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { cn } from '@/lib/utils'

export function FAQExplorer() {
  const prefersReducedMotion = useReducedMotion()
  const [openIndex, setOpenIndex] = useState<number | null>(0)
  const [searchQuery, setSearchQuery] = useState('')

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
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#70685A] pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search questions (e.g. certificate, free, timeline, PRDs)..."
          className="
            w-full pl-10 pr-10 py-3 bg-white border border-[#DED8CB] rounded-xl text-sm text-[#171A17]
            placeholder:text-[#8A8174] shadow-2xs
            focus:outline-none focus:border-[#1F6B4E] focus:ring-2 focus:ring-[#1F6B4E]/10
            transition-all
          "
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#70685A] hover:text-[#171A17] p-0.5"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* ── Accordion List ──────────────────────────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-14 px-6 bg-white border border-dashed border-[#DED8CB] rounded-2xl space-y-3">
          <p className="text-base font-semibold text-[#171A17]">No questions found</p>
          <p className="text-sm text-[#70685A]">
            No answers matched &quot;{searchQuery}&quot;. Try searching with a different term.
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F6B4E] text-white text-xs font-semibold rounded-lg hover:bg-[#18553E] transition-colors mt-2"
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
                  'rounded-2xl border transition-all duration-180 bg-white overflow-hidden',
                  isOpen
                    ? 'border-[#1F6B4E]/40 shadow-xs'
                    : 'border-[#DED8CB] hover:border-[#BDB4A2]',
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
                  <span className="text-base sm:text-lg font-semibold text-[#171A17] tracking-tight">
                    {item.question}
                  </span>
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full border border-[#DED8CB] flex items-center justify-center shrink-0 transition-transform duration-200',
                      isOpen ? 'rotate-180 bg-[#1F6B4E] text-white border-transparent' : 'bg-[#FBFAF6] text-[#70685A]',
                    )}
                  >
                    <ChevronDown size={16} />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`faq-answer-${item.originalIndex}`}
                      role="region"
                      aria-labelledby={`faq-btn-${item.originalIndex}`}
                      initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 sm:px-6 pb-6 pt-1 text-sm sm:text-base text-[#70685A] leading-relaxed border-t border-[#DED8CB]/60">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
