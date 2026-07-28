import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'My Progress | PM Academy',
  description: 'Track your skill radar achievements, total XP, streaks, and certificates.',
}

export default function ProgressPage() {
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
          My Progress
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Monitor your skill development, badges, and learning path.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm text-foreground/80 leading-relaxed">
          Competency dashboard, badges showcase, and certificate/portfolio export options. This page is scaffolded and ready for implementation (Phase 2 & 3).
        </p>
      </div>
    </div>
  )
}
