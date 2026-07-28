'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { FlashcardItem } from '@/types'
import { Sparkles, HelpCircle } from 'lucide-react'

interface FlashcardCardProps {
  card: FlashcardItem
  onReview: (rating: number) => Promise<void>
}

export default function FlashcardCard({ card, onReview }: FlashcardCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [submitting, setSubmitting] = useState<number | null>(null)
  const ratingRowRef = useRef<HTMLDivElement>(null)

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev)
  }, [])

  // Keyboard accessibility: flip card with Space/Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return
      }

      if ((e.key === ' ' || e.key === 'Enter') && !isFlipped) {
        // Only flip if not already focused on interactive elements
        const isRatingFocused = ratingRowRef.current?.contains(document.activeElement)
        if (!isRatingFocused) {
          e.preventDefault()
          handleFlip()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFlipped, handleFlip])

  const handleRate = async (rating: number) => {
    setSubmitting(rating)
    try {
      await onReview(rating)
    } catch (err) {
      console.error(err)
      setSubmitting(null)
    }
  }

  const ratingOptions = [
    { value: 0, label: 'Blackout', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
    { value: 1, label: 'Wrong', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
    { value: 2, label: 'Hard', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { value: 3, label: 'Pass', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    { value: 4, label: 'Good', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    { value: 5, label: 'Perfect', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  ]

  return (
    <div className="w-full max-w-lg mx-auto perspective-1000 h-[380px]">
      <div
        className={`relative w-full h-full duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* FRONT SIDE */}
        <div
          className={`absolute inset-0 w-full h-full backface-hidden rounded-2xl border border-border bg-card p-8 flex flex-col justify-between shadow-sm cursor-pointer hover:shadow-md transition-all ${
            isFlipped ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
          onClick={handleFlip}
          role="button"
          tabIndex={isFlipped ? -1 : 0}
          aria-label="Front of flashcard. Click, or press Space or Enter, to flip."
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
            <span>Question</span>
          </div>

          <div className="flex-1 flex items-center justify-center py-6 text-center">
            <p className="text-xl md:text-2xl font-bold font-serif text-foreground leading-relaxed">
              {card.front}
            </p>
          </div>

          <div className="text-center text-xs text-muted-foreground/60 border-t border-border/40 pt-4 font-semibold uppercase tracking-widest">
            Click to Flip or Press Space
          </div>
        </div>

        {/* BACK SIDE */}
        <div
          className={`absolute inset-0 w-full h-full backface-hidden rotate-y-180 rounded-2xl border border-border bg-card p-8 flex flex-col justify-between shadow-sm ${
            !isFlipped ? 'pointer-events-none opacity-0' : 'opacity-100'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-4 w-4" />
            <span>Answer</span>
          </div>

          <div className="flex-1 flex items-center justify-center py-6 text-center overflow-y-auto">
            <p className="text-base md:text-lg font-medium text-foreground/90 leading-relaxed whitespace-pre-line">
              {card.back}
            </p>
          </div>

          {/* Spaced repetition review ratings */}
          <div className="border-t border-border/40 pt-4" ref={ratingRowRef}>
            <div className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              How well did you recall this?
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ratingOptions.map((opt) => (
                <button
                  key={opt.value}
                  disabled={submitting !== null}
                  tabIndex={isFlipped ? 0 : -1}
                  onClick={() => handleRate(opt.value)}
                  className={`flex flex-col items-center justify-center py-2 px-1.5 rounded-lg border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary ${opt.color} hover:brightness-95 active:brightness-90 disabled:opacity-40`}
                >
                  <span className="text-base font-serif font-extrabold">{opt.value}</span>
                  <span className="text-[10px] font-semibold mt-0.5 tracking-tight">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
