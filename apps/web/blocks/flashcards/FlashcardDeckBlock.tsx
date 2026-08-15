'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HelpCircle, Sparkles, Award, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BlockProps } from '../../renderer/registry';
import { useLessonContextSafe } from '@/contexts/lesson-context';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  difficulty?: number;
  tags?: string[];
}

export default function FlashcardDeckBlock({ block, previewMode }: BlockProps) {
  const cards: Flashcard[] = block.cards || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lessonCtx = useLessonContextSafe();
  const onFlashcardsComplete = lessonCtx?.onFlashcardsComplete;

  const handleReset = () => {
    setCurrentIndex(0);
    setSessionXp(0);
    setIsFinished(false);
  };

  const handleReview = async (rating: number) => {
    if (isSubmitting) return;
    const card = cards[currentIndex];
    setIsSubmitting(true);

    try {
      // Read-only previews (e.g. the admin lesson preview) must never record
      // real SRS reviews or award XP — advance the deck locally instead.
      if (!previewMode) {
        const res = await fetch(`/api/flashcards/${card.id}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ rating }),
        });

        if (!res.ok) {
          throw new Error('Failed to record flashcard review');
        }
      }

      // Increment session XP count locally by 2 XP (XP_VALUES.FLASHCARD_REVIEW)
      setSessionXp((x) => x + 2);
    } catch (err) {
      console.error('[FlashcardDeckBlock] Error saving review:', err);
    } finally {
      setIsSubmitting(false);
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsFinished(true);
        if (onFlashcardsComplete) {
          onFlashcardsComplete();
        }
      }
    }
  };

  if (cards.length === 0) {
    return (
      <div className="text-center py-12 space-y-4 border border-border rounded-xl bg-card my-6">
        <p className="text-muted-foreground text-sm">No flashcards available for this lesson.</p>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="max-w-md mx-auto text-center py-10 space-y-8 animate-fade-in my-6">
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

        <Button onClick={handleReset} variant="outline" size="lg" className="w-full font-medium">
          <RotateCcw className="h-4 w-4 mr-2" />
          Review Again
        </Button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="space-y-6 animate-fade-in my-6">
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
        <FlashcardItemCard key={currentCard.id} card={currentCard} onReview={handleReview} isSubmitting={isSubmitting} />
      </div>
    </div>
  );
}

function FlashcardItemCard({ card, onReview, isSubmitting }: { card: Flashcard; onReview: (rating: number) => void; isSubmitting: boolean }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const ratingRowRef = useRef<HTMLDivElement>(null);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsFlipped(false);
  }, [card.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if ((e.key === ' ' || e.key === 'Enter') && !isFlipped) {
        const isRatingFocused = ratingRowRef.current?.contains(document.activeElement);
        if (!isRatingFocused) {
          e.preventDefault();
          handleFlip();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFlipped, handleFlip]);

  const ratingOptions = [
    { value: 0, label: 'Blackout', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
    { value: 1, label: 'Wrong', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
    { value: 2, label: 'Hard', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { value: 3, label: 'Pass', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    { value: 4, label: 'Good', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    { value: 5, label: 'Perfect', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  ];

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
                  tabIndex={isFlipped ? 0 : -1}
                  disabled={!isFlipped || isSubmitting}
                  onClick={() => onReview(opt.value)}
                  className={`flex flex-col items-center justify-center py-2 px-1.5 rounded-lg border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-primary ${opt.color} hover:brightness-95 active:brightness-90 disabled:opacity-50 disabled:cursor-not-allowed`}
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
  );
}
