'use client'

import { useState } from 'react'
import { FlashcardItem, ReviewStats as ReviewStatsType, SRSRating } from '@/lib/srs'
import { ReviewStats } from './ReviewStats'
import { ReviewProgress } from './ReviewProgress'
import { Flashcard } from './Flashcard'
import { QualitySelector } from './QualitySelector'
import { EmptyState } from './EmptyState'
import { ReviewComplete } from './ReviewComplete'
import { Layers } from 'lucide-react'

interface ReviewHubProps {
  initialDueCards: FlashcardItem[]
  initialStats: ReviewStatsType
  totalUnlockedCount: number
}

export function ReviewHub({
  initialDueCards,
  initialStats,
  totalUnlockedCount,
}: ReviewHubProps) {
  const [dueCards, setDueCards] = useState<FlashcardItem[]>(initialDueCards)
  const [stats, setStats] = useState<ReviewStatsType>(initialStats)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(false)

  // Tracking session results
  const [reviewedCount, setReviewedCount] = useState(0)
  const [xpEarned, setXpEarned] = useState(0)
  const [passedCount, setPassedCount] = useState(0)

  // Empty state 1: No flashcards unlocked at all across curriculum
  if (totalUnlockedCount === 0) {
    return (
      <div className="space-y-8">
        <ReviewStats stats={stats} />
        <EmptyState type="no_cards_unlocked" />
      </div>
    )
  }

  // Empty state 2: All caught up (no due cards today) and no session active
  if (dueCards.length === 0 && !sessionCompleted) {
    return (
      <div className="space-y-8">
        <ReviewStats stats={stats} />
        <EmptyState type="all_caught_up" />
      </div>
    )
  }

  // Session completed view
  if (sessionCompleted) {
    return (
      <div className="space-y-8">
        <ReviewStats stats={stats} />
        <ReviewComplete
          cardsReviewedCount={reviewedCount}
          totalXpEarned={xpEarned}
          passedCount={passedCount}
          onRestartSession={() => {
            setDueCards(initialDueCards)
            setCurrentIndex(0)
            setIsFlipped(false)
            setSessionCompleted(false)
            setReviewedCount(0)
            setXpEarned(0)
            setPassedCount(0)
          }}
        />
      </div>
    )
  }

  const currentCard = dueCards[currentIndex]

  const handleRatingSelect = async (rating: SRSRating) => {
    if (!currentCard || isSubmitting) return
    setIsSubmitting(true)

    try {
      // Submit review rating to server-side API endpoint
      const response = await fetch(`/api/flashcards/${currentCard.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })

      if (!response.ok) {
        console.error('[ReviewHub] Failed to save flashcard review rating.')
      } else {
        // Track session stats
        setReviewedCount((prev) => prev + 1)
        setXpEarned((prev) => prev + 2) // 2 XP per card
        if (rating >= 3) {
          setPassedCount((prev) => prev + 1)
        }
      }
    } catch (err) {
      console.error('[ReviewHub] Error submitting review:', err)
    } finally {
      setIsSubmitting(false)

      // Move to next card or complete session
      if (currentIndex + 1 < dueCards.length) {
        setIsFlipped(false)
        setCurrentIndex((prev) => prev + 1)
      } else {
        setSessionCompleted(true)
        setStats((prev) => ({
          ...prev,
          dueTodayCount: 0,
          completedTodayCount: prev.completedTodayCount + (currentIndex + 1),
        }))
      }
    }
  }

  return (
    <div className="space-y-8">
      {/* Review Stats Header */}
      <ReviewStats stats={stats} />

      {/* Active Session Area */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-serif text-foreground">
              Daily Spaced Repetition Practice
            </h2>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">
            SM-2 Spaced Repetition
          </span>
        </div>

        {/* Progress Bar */}
        <ReviewProgress
          currentIndex={currentIndex}
          totalCards={dueCards.length}
        />

        {/* Interactive 3D Flip Card */}
        {currentCard && (
          <Flashcard
            card={currentCard}
            isFlipped={isFlipped}
            onFlip={() => setIsFlipped((prev) => !prev)}
          />
        )}

        {/* Quality Rating Selector (shown when card is flipped or always accessible) */}
        <QualitySelector
          disabled={isSubmitting}
          onSelect={handleRatingSelect}
        />
      </div>
    </div>
  )
}
