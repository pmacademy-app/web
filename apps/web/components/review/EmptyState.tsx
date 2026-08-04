import Link from 'next/link'
import { CheckCircle2, Lock, ArrowRight } from 'lucide-react'

interface EmptyStateProps {
  type: 'all_caught_up' | 'no_cards_unlocked'
}

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'all_caught_up') {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 md:p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-xl font-bold font-serif text-foreground">
            All Caught Up for Today! 🎉
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            You have reviewed all due flashcards for today. The SM-2 algorithm will schedule your next set of reviews automatically!
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Back to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-8 md:p-12 text-center max-w-xl mx-auto space-y-4 shadow-sm">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center mx-auto">
        <Lock className="w-7 h-7" />
      </div>
      <div className="space-y-1">
        <h3 className="text-xl font-bold font-serif text-foreground">
          No Flashcards Unlocked Yet
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Flashcards unlock automatically as you complete lessons in the PM Academy curriculum. Complete your first lesson to unlock flashcard decks!
        </p>
      </div>
      <div className="pt-2">
        <Link
          href="/academy"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          Go to Curriculum
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
