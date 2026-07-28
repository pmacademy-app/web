import React from 'react'
import { Trophy, ArrowRight, RotateCcw, Zap, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface QuizSummaryProps {
  correctCount: number
  totalQuestions: number
  xpEarned: number
  isPerfect: boolean
  isFirstAttempt: boolean
  onReset: () => void
  onProceed: () => void
}

export default function QuizSummary({
  correctCount,
  totalQuestions,
  xpEarned,
  isPerfect,
  isFirstAttempt,
  onReset,
  onProceed,
}: QuizSummaryProps) {
  const percentage = Math.round((correctCount / totalQuestions) * 100)

  return (
    <div className="max-w-xl mx-auto text-center py-8 space-y-8 animate-fade-in">
      <div className="flex justify-center">
        {isPerfect ? (
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-amber-500 blur opacity-40 animate-pulse" />
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <Trophy className="h-10 w-10 animate-bounce" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary border border-primary/20">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground">
          {isPerfect ? 'Flawless Victory!' : 'Quiz Completed!'}
        </h2>
        <p className="text-muted-foreground text-sm">
          You scored <span className="font-bold text-foreground">{correctCount}</span> out of{' '}
          <span className="font-semibold">{totalQuestions}</span> correct answers ({percentage}%).
        </p>
      </div>

      {/* XP Earning breakdown card */}
      <div className="rounded-xl border border-border bg-card p-6 max-w-sm mx-auto shadow-sm space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">XP Breakdown</h3>
        <div className="space-y-2.5">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Correct Answers ({correctCount})</span>
            <span className="font-semibold text-foreground">+{correctCount * 5} XP</span>
          </div>

          {isPerfect && isFirstAttempt && (
            <div className="flex justify-between items-center text-sm text-amber-600 dark:text-amber-400 font-semibold border-t border-border pt-2">
              <span className="flex items-center gap-1">
                <Zap className="h-4 w-4 shrink-0 fill-current" />
                First-Attempt Perfect Bonus
              </span>
              <span>+25 XP</span>
            </div>
          )}

          <div className="flex justify-between items-center border-t border-border pt-2 text-base font-bold text-foreground">
            <span>Total XP Gained</span>
            <span className="text-primary font-serif">+{xpEarned} XP</span>
          </div>
        </div>
      </div>

      {/* Call to Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
        <Button onClick={onReset} variant="outline" size="lg" className="w-full sm:w-auto font-medium">
          <RotateCcw className="h-4 w-4 mr-2" />
          Retry Quiz
        </Button>
        <Button onClick={onProceed} size="lg" className="w-full sm:w-auto font-medium">
          Continue to Flashcards
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
