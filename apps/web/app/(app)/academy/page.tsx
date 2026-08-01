/**
 * /academy — Curriculum landing page (Server Component)
 *
 * Shows the full 9-module curriculum grid with lesson counts,
 * estimated time, and difficulty overview. Acts as the main entry
 * point for authenticated users navigating to the curriculum.
 *
 * Replaces the broken /curriculum link for authenticated users (M-009 fix).
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import type { CurriculumEntry } from '@/types'
import { BookOpen, Clock, ChevronRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Curriculum | PM Academy',
  description: 'All 90 PM Academy lessons across 9 modules — theory, quizzes, flashcards, and reflections.',
}

// Module display metadata (derived from lesson data but enriched with display info)
const MODULE_META: Record<string, { name: string; description: string; color: string }> = {
  'foundations': {
    name: 'Foundations',
    description: 'Core PM concepts, frameworks, and the product mindset.',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  'discovery': {
    name: 'Discovery & Research',
    description: 'User research, problem definition, and opportunity identification.',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  'strategy': {
    name: 'Product Strategy',
    description: 'Vision, prioritization, roadmaps, and competitive thinking.',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  'execution': {
    name: 'Product Execution',
    description: 'Agile, specs, cross-functional collaboration, and shipping.',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  },
  'growth': {
    name: 'Growth & Metrics',
    description: 'Analytics, experimentation, funnels, and growth loops.',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  },
  'leadership': {
    name: 'PM Leadership',
    description: 'Influence, stakeholder management, and career growth.',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
  },
  'technical': {
    name: 'Technical Fundamentals',
    description: 'APIs, data, architecture basics, and working with engineers.',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
  },
  'design': {
    name: 'Design Thinking',
    description: 'UX principles, design collaboration, and user-centred product decisions.',
    color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
  },
  'capstone': {
    name: 'Capstone Projects',
    description: 'Applied, portfolio-ready projects demonstrating PM mastery.',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  },
}

function groupByModule(lessons: CurriculumEntry[]) {
  const groups = new Map<string, CurriculumEntry[]>()
  for (const lesson of lessons) {
    const arr = groups.get(lesson.module) ?? []
    arr.push(lesson)
    groups.set(lesson.module, arr)
  }
  return groups
}

export default async function AcademyPage() {
  const curriculum = await fetchCurriculumData()
  const lessons = curriculum?.lessons ?? []

  const byModule = groupByModule(lessons)

  // Build ordered module list (order determined by first lesson in each module)
  const orderedModules = [...byModule.entries()].sort(
    ([, a], [, b]) => (a[0]?.order ?? 0) - (b[0]?.order ?? 0)
  )

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Page Header */}
      <div className="space-y-2">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">
          PM Academy Curriculum
        </span>
        <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
          All 90 Lessons
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          A complete curriculum from PM fundamentals to advanced execution — structured as 9 modules,
          each with 10 lessons, a practice quiz, spaced repetition flashcards, and a capstone project.
        </p>
      </div>

      {/* Module Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedModules.map(([moduleSlug, moduleLessons], idx) => {
          const meta = MODULE_META[moduleSlug]
          const moduleNumber = idx + 1
          const firstLesson = moduleLessons[0]
          const totalTime = moduleLessons.reduce(
            (sum, l) => sum + (l.estimatedCompletionTime ?? 30),
            0
          )
          const hours = Math.floor(totalTime / 60)
          const mins = totalTime % 60

          return (
            <div
              key={moduleSlug}
              className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4 hover:shadow-md transition-shadow"
            >
              {/* Module badge */}
              <div className="flex items-center justify-between">
                <span
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                    meta?.color ?? 'bg-muted text-muted-foreground border-border'
                  }`}
                >
                  Module {moduleNumber}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {moduleLessons.length} lessons
                </span>
              </div>

              {/* Module name & description */}
              <div className="space-y-1">
                <h2 className="text-base font-bold font-serif text-foreground">
                  {meta?.name ?? moduleSlug}
                </h2>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {meta?.description ?? ''}
                </p>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BookOpen className="h-3.5 w-3.5" />
                  {moduleLessons.length} lessons
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {hours > 0 ? `${hours}h ` : ''}{mins > 0 ? `${mins}m` : ''}
                </span>
              </div>

              {/* Start CTA */}
              {firstLesson && (
                <Link
                  href={`/academy/l/${firstLesson.id}`}
                  className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/10 transition-colors"
                >
                  <span>Start Module {moduleNumber}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {/* Flat lesson list (expandable in Phase 2) */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-base font-bold font-serif text-foreground">All Lessons</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click any lesson to open it directly.
          </p>
        </div>
        <div className="divide-y divide-border">
          {lessons.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/academy/l/${lesson.id}`}
              className="flex items-center justify-between px-6 py-3.5 hover:bg-accent/30 transition-colors group"
              id={`lesson-link-${lesson.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold text-muted-foreground shrink-0 w-8 text-right">
                  {lesson.order}
                </span>
                <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {lesson.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <span className="text-xs text-muted-foreground">
                  {lesson.estimatedReadingTime}m
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
