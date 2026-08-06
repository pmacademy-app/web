import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { getReviewQueueData } from '@/lib/flashcards-service'
import { ReviewHub } from '@/components/review/ReviewHub'

export const metadata: Metadata = {
  title: 'Flashcard Review Hub (SM-2)',
  description: 'Daily spaced repetition flashcard practice powered by the SM-2 algorithm.',
}

export default async function ReviewHubPage() {
  const authUser = await getServerUser()
  if (!authUser) {
    redirect('/login')
  }

  const supabase = createServerSupabaseClient()
  const queueData = await getReviewQueueData(supabase, authUser.id)

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="border-b border-border pb-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-3">
          Flashcard Review Hub
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Strengthen your long-term memory retention loop using the SM-2 spaced repetition algorithm.
        </p>
      </div>

      <ReviewHub
        initialDueCards={queueData.dueCards}
        initialStats={queueData.stats}
        totalUnlockedCount={queueData.allUnlockedCards.length}
      />
    </div>
  )
}
