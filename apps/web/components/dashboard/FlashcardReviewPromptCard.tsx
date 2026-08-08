'use client'

import React from 'react'
import Link from 'next/link'
import { Brain, ArrowRight, CheckCircle2 } from 'lucide-react'

interface FlashcardReviewPromptCardProps {
  dueCount: number
  totalUnlocked: number
}

export function FlashcardReviewPromptCard({ dueCount, totalUnlocked }: FlashcardReviewPromptCardProps) {
  const hasDue = dueCount > 0

  return (
    <div className="p-5 rounded-2xl border border-border/80 bg-card/60 space-y-3 flex flex-col justify-between shadow-xs">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" /> Spaced Repetition SRS
          </span>
          <span
            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded border ${
              hasDue
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            }`}
          >
            {hasDue ? `${dueCount} Due Today` : 'Caught Up'}
          </span>
        </div>

        <h3 className="text-sm font-bold font-serif text-foreground">
          {hasDue ? `${dueCount} Flashcards Due for Review` : 'Daily Flashcard Review Complete'}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {hasDue
            ? 'Reinforce memory retention using the SM-2 spaced repetition algorithm.'
            : `${totalUnlocked} unlocked flashcards reviewed. Great memory retention!`}
        </p>
      </div>

      <Link
        href="/review"
        className="inline-flex items-center justify-between text-xs font-bold text-purple-400 hover:text-purple-300 pt-2 border-t border-border/40 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {hasDue ? (
            <>Start Daily Review ({dueCount})</>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Open Review Hub
            </>
          )}
        </span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  )
}
