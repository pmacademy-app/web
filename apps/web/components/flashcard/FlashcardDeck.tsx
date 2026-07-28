'use client'

import React, { useState } from 'react'
import type { FlashcardItem } from '@/types'
import FlashcardCard from './FlashcardCard'
import { Button } from '@/components/ui/button'
import { ArrowRight, Award } from 'lucide-react'

interface FlashcardDeckProps {
  cards: FlashcardItem[]
  onProceedToReflection: () => void
}

export default function FlashcardDeck({ cards, onProceedToReflection }: FlashcardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [sessionXp, setSessionXp] = useState(0)
  const [isFinished, setIsFinished] = useState(false)

  if (cards.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-muted-foreground text-sm">No flashcards available for this lesson.</p>
        <Button onClick={onProceedToReflection}>Proceed to Reflection</Button>
      </div>
    )
  }

  const currentCard = cards[currentIndex]

  const handleReview = async (rating: number) => {
    try {
      const res = await fetch(`/api/flashcards/${currentCard.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (res.ok) {
        setSessionXp((x) => x + 2)
      }
    } catch (err) {
      console.error('[flashcard-deck] Error saving review:', err)
    }

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1)
    } else {
      setIsFinished(true)
    }
  }

  if (isFinished) {
    return (
      <div className="max-w-md mx-auto text-center py-10 space-y-8 animate-fade-in">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Award className="h-8 w-8" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold font-serif text-foreground">Deck Completed!</h2>
          <p className="text-muted-foreground text-sm">
            You reviewed <span className="font-semibold text-foreground">{cards.length}</span> flashcards.
          </p>
        </div>

        <div className="p-5 rounded-xl border border-border bg-card shadow-sm flex items-center justify-between">
          <span className="text-sm font-semibold text-muted-foreground">Session XP Earned</span>
          <span className="text-primary font-serif font-bold text-lg">+{sessionXp} XP</span>
        </div>

        <Button onClick={onProceedToReflection} size="lg" className="w-full font-medium">
          Continue to Reflection
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between max-w-lg mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          Flashcard Review
        </span>
        <span className="text-xs font-semibold text-muted-foreground">
          Card {currentIndex + 1} of {cards.length}
        </span>
      </div>

      <div className="max-w-lg mx-auto h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
        />
      </div>

      <div className="py-2">
        <FlashcardCard key={currentCard.id} card={currentCard} onReview={handleReview} />
      </div>
    </div>
  )
}
