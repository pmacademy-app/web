import Link from 'next/link'
import { CheckCircle2, Lock, ArrowRight } from 'lucide-react'
import { EmptyState as SharedEmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  type: 'all_caught_up' | 'no_cards_unlocked'
}

export function EmptyState({ type }: EmptyStateProps) {
  if (type === 'all_caught_up') {
    return (
      <SharedEmptyState
        icon={CheckCircle2}
        title="All Caught Up for Today! 🎉"
        description="You have reviewed all due flashcards for today. The SM-2 algorithm will schedule your next set of reviews automatically!"
        className="max-w-xl mx-auto shadow-sm bg-card border-solid"
        action={
          <Link
            href="/dashboard"
            className={cn(buttonVariants(), 'rounded-xl font-semibold gap-2')}
          >
            Back to Dashboard
            <ArrowRight className="w-4 h-4" />
          </Link>
        }
      />
    )
  }

  return (
    <SharedEmptyState
      icon={Lock}
      title="No Flashcards Unlocked Yet"
      description="Flashcards unlock automatically as you complete lessons in the PM Academy curriculum. Complete your first lesson to unlock flashcard decks!"
      className="max-w-xl mx-auto shadow-sm bg-card border-solid"
      action={
        <Link
          href="/academy"
          className={cn(buttonVariants(), 'rounded-xl font-semibold gap-2')}
        >
          Go to Curriculum
          <ArrowRight className="w-4 h-4" />
        </Link>
      }
    />
  )
}
