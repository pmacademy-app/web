import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Leaderboard | PM Academy',
  description: 'Opt-in weekly consistency rankings with friends and cohort members.',
}

export default function LeaderboardPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">
      <div className="border-b border-border pb-4">
        <Link
          href="/dashboard"
          className="text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          ← Back to Dashboard
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-4">
          Weekly Leaderboard
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Stay motivated by learning consistently with your cohort.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground/80 leading-relaxed">
          Weekly resetting consistency-based rank (opt-in only). This page is scaffolded and ready for implementation (Phase 3).
        </p>
      </div>
    </div>
  )
}
