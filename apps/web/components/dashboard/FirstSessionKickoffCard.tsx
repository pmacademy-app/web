'use client'

import Link from 'next/link'
import { Sparkles, Play, Flame, Zap, Clock, BookOpen } from 'lucide-react'
import { trackFirstSessionStarted } from '@/lib/analytics'
import type { NextLessonData } from './ContinueLearningCard'

interface FirstSessionKickoffCardProps {
  nextLesson: NextLessonData
}

export function FirstSessionKickoffCard({ nextLesson }: FirstSessionKickoffCardProps) {
  const handleCtaClick = () => {
    trackFirstSessionStarted({
      lesson_id: nextLesson.id,
      module_slug: nextLesson.module,
    })
  }

  const moduleName = nextLesson.module.replace(/-/g, ' ')

  return (
    <div
      data-testid="first-session-kickoff-card"
      className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-card p-6 md:p-8 shadow-md"
    >
      {/* Subtle decorative background glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-3 max-w-2xl">
          {/* Milestone and benefit pill tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              First-Session Kickoff
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              <Flame className="w-3 h-3" />
              Starts Day 1 Streak
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
              <Zap className="w-3 h-3" />
              +50 XP Preview
            </span>
          </div>

          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground leading-tight">
            Start Your First Lesson: {nextLesson.title}
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed">
            Kick off your product management journey. Complete theory reading, test your knowledge with a short quiz, and lock in your first learning milestone.
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/90 capitalize">
              <BookOpen className="w-3.5 h-3.5 text-primary" />
              Module: {moduleName}
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground/90">
              <Clock className="w-3.5 h-3.5 text-primary" />
              Est. Time: {nextLesson.estimatedTime}
            </span>
            <span>•</span>
            <span className="text-foreground/80 font-medium">Theory + Interactive Quiz</span>
          </div>
        </div>

        {/* Primary CTA */}
        <div className="w-full lg:w-auto flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center gap-3">
          <Link
            href={`/academy/${nextLesson.module}/${nextLesson.id}`}
            onClick={handleCtaClick}
            className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-primary px-7 py-4 text-sm font-bold text-primary-foreground shadow-lg hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Play className="w-4 h-4 fill-current" />
            Start Lesson 1 →
          </Link>
          <span className="text-[11px] text-center text-muted-foreground">
            Takes ~5 mins to complete
          </span>
        </div>
      </div>
    </div>
  )
}
