import Link from 'next/link'
import { ArrowRight, BookOpen, Clock, Layers, Zap } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LevelInfo } from '@/lib/xp/xp'
import { getLevelTitle } from '@/lib/xp/xp'
import { CareerLadder } from './CareerLadder'

export interface NextLessonPanelData {
  id: string
  /** Module slug, part of the lesson URL */
  module: string
  /** "Module 3 · Lesson 5" */
  positionLabel: string
  moduleTitle: string
  title: string
  estimatedTime: string
  /** e.g. 4 of 10 lessons done in this module */
  moduleDone: number
  moduleTotal: number
}

/** The main card: the next lesson, how close it gets you to the next level, and the ladder. */
export function NextLessonPanel({ lesson, level, totalXp }: { lesson: NextLessonPanelData | null; level: LevelInfo; totalXp: number }) {
  const nextTitle = level.xpRemaining > 0 ? getLevelTitle(level.level + 1) : null
  return (
    <section aria-labelledby="next-lesson-title" className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      {lesson ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              {lesson.positionLabel} · {lesson.moduleTitle}
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-semibold text-primary">
              <BookOpen className="size-3.5" />
              <span className="tabular-nums">{lesson.moduleDone} of {lesson.moduleTotal}</span> in module
            </span>
          </div>
          <h2 id="next-lesson-title" className="mt-2 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">{lesson.title}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><Clock className="size-4" />{lesson.estimatedTime} with quiz and reflection</span>
            <span className="inline-flex items-center gap-1.5"><Layers className="size-4" />Flashcards unlock on finish</span>
          </div>
          {nextTitle && (
            <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/30 bg-warning-bg px-3.5 py-2.5 text-sm leading-snug">
              <Zap className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <span className="font-semibold tabular-nums">{level.xpRemaining.toLocaleString('en-US')} XP</span> to <span className="font-semibold">{nextTitle}</span>. Reading, the quiz and the reflection in this lesson all earn XP toward it.
              </span>
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex">
            <Link href={`/academy/${lesson.module}/${lesson.id}`} className={cn(buttonVariants({ size: 'lg' }), 'h-11 rounded-xl px-5')}>
              Resume lesson
              <ArrowRight />
            </Link>
            <Link href="/academy" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 rounded-xl px-5')}>
              Open module map
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Curriculum</p>
          <h2 id="next-lesson-title" className="mt-2 text-2xl font-bold tracking-tight">Every lesson is done</h2>
          <p className="mt-1.5 text-sm text-ink-muted">Review your flashcards and finish any open capstones to keep your streak going.</p>
        </>
      )}
      <div className="mt-5 border-t border-border/70 pt-4">
        <CareerLadder level={level} totalXp={totalXp} />
      </div>
    </section>
  )
}
