
import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import type { CurriculumEntry } from '@/types'
import {
  BookOpen,
  Clock,
  ChevronRight,
  Layers,
  Sparkles,
  CheckCircle2,
  PlayCircle,
  Play,
  ArrowRight,
  Check,
} from 'lucide-react'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { BRAND } from '@/lib/brand'
import { resolvePersonalizedPath } from '@/lib/personalization/path-resolver'
import { resolveModuleCtaTarget } from '@/lib/curriculum-access'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { CURRICULUM_MODULE_META } from '@/lib/admin/curriculum-meta'
import { CurriculumModuleIcon } from '@/components/curriculum/CurriculumModuleIcon'

export const metadata: Metadata = {
  title: 'Curriculum',
  description: 'All 90 PM Academy lessons across 9 modules: theory, quizzes, flashcards, and reflections.',
}

function groupByModule(lessons: CurriculumEntry[]): Map<string, CurriculumEntry[]> {
  const groups = new Map<string, CurriculumEntry[]>()
  for (const lesson of lessons) {
    const arr = groups.get(lesson.module) ?? []
    arr.push(lesson)
    groups.set(lesson.module, arr)
  }
  for (const [, lessonArr] of groups) {
    lessonArr.sort((a, b) => a.order - b.order)
  }
  return groups
}

export default async function AcademyPage() {
  const [curriculum, user] = await Promise.all([
    fetchCurriculumData(),
    getServerUser(),
  ])

  const lessons = curriculum?.lessons ?? []
  const byModule = groupByModule(lessons)

  // Fetch completed lessons and personalization profile for current user
  let completedSet = new Set<string>()
  let personalizedPath = resolvePersonalizedPath(null)
  if (user) {
    const supabase = createServiceRoleClient()
    const [{ data: rows }, { data: dbUser }] = await Promise.all([
      supabase
        .from('user_lesson_progress')
        .select('lesson_id')
        .eq('user_id', user.id)
        .eq('status', 'completed'),
      supabase
        .from('users')
        .select('goal, career_role, onboarding_topics, onboarding_preference, learning_purpose')
        .eq('id', user.id)
        .maybeSingle(),
    ])
    if (rows) {
      completedSet = new Set((rows as { lesson_id: string }[]).map((r) => r.lesson_id))
    }
    if (dbUser) {
      personalizedPath = resolvePersonalizedPath(dbUser as Parameters<typeof resolvePersonalizedPath>[0])
    }
  }

  const orderedModules = [...byModule.entries()].sort(
    ([, a], [, b]) => (a[0]?.order ?? 0) - (b[0]?.order ?? 0)
  )

  const totalLessons = lessons.length
  const totalCompleted = lessons.filter((l) => completedSet.has(l.id)).length
  const overallPercentage = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0
  const completedModulesCount = orderedModules.filter(
    ([, modLessons]) => modLessons.length > 0 && modLessons.every((l) => completedSet.has(l.id))
  ).length

  // Find next actionable lesson for instant resume
  const nextIncompleteLesson = lessons.find((l) => !completedSet.has(l.id)) || lessons[0]

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

  const courseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: BRAND.fullName,
    description: '90 structured lessons across 9 modules covering Product Management strategy, execution, growth, and leadership. Completely free with interactive quizzes, spaced repetition, and portfolio capstones.',
    url: `${siteUrl}/academy`,
    image: `${siteUrl}${BRAND.assets.ogImage}`,
    provider: {
      '@type': 'Organization',
      name: BRAND.fullName,
      url: siteUrl,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
    },
    educationalLevel: 'Beginner to Advanced',
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: 'PT90H',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(courseJsonLd) }}
      />
      <div className="container mx-auto px-4 py-8 lg:py-12 max-w-5xl space-y-8">
        {/* Page Header with Pie Chart in front of it */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-8">
          <div className="space-y-3 max-w-2xl flex-1">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground">
              The Complete Product Curriculum
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              Master product management from first principles to senior judgment across 9 structured modules, 90 lessons, interactive practice quizzes, and portfolio capstone projects.
            </p>

            {/* Quick Stats Bar */}
            <div className="flex flex-wrap items-center gap-6 pt-1 text-xs text-muted-foreground font-medium">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                <span>9 Comprehensive Modules</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span>90 Applied Lessons</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>~45 Hours of Structured Practice</span>
              </div>
            </div>
          </div>

          {/* Pie Chart Widget with Dynamic Green Progress Circle & Hover Play Button */}
          <div className="shrink-0 self-start lg:self-center">
            <Link
              href={
                nextIncompleteLesson
                  ? `/academy/${nextIncompleteLesson.module}/${nextIncompleteLesson.id}`
                  : '/academy'
              }
              title={
                nextIncompleteLesson
                  ? `Continue: Lesson ${nextIncompleteLesson.order} - ${nextIncompleteLesson.title}`
                  : 'Curriculum Completed'
              }
              className="group relative rounded-2xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs flex items-center gap-4.5 hover:border-emerald-500/50 hover:bg-card/90 hover:shadow-md transition-all block focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
            >
              {/* Pie Chart Circle -> Dynamic Green Progress, Transforms to Play button on hover */}
              <div className="relative flex items-center justify-center shrink-0">
                <svg className="w-24 h-24 sm:w-28 sm:h-28 -rotate-90 group-hover:scale-105 transition-transform duration-300" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="text-muted/40 dark:text-muted/30"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    className="text-emerald-500 dark:text-emerald-400 transition-all duration-700 ease-out"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={251.3}
                    strokeDashoffset={251.3 - (overallPercentage / 100) * 251.3}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Default State: Percentage & Completed Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center transition-all duration-200 group-hover:opacity-0 group-hover:scale-75 pointer-events-none">
                  <span className="text-xl sm:text-2xl font-bold font-mono text-foreground tracking-tight">
                    {overallPercentage}%
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                    Completed
                  </span>
                </div>

                {/* Hover State: Play Button to Continue Lesson */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-200 pointer-events-none">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 min-w-[120px]">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  <span>{nextIncompleteLesson ? 'Continue Lesson' : 'Review Curriculum'}</span>
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-emerald-600 dark:text-emerald-400" />
                </div>
                {nextIncompleteLesson && (
                  <div className="text-[11px] text-muted-foreground line-clamp-1 max-w-[160px]">
                    Lesson {nextIncompleteLesson.order}: {nextIncompleteLesson.title}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground font-mono">
                  <span className="font-semibold text-foreground">{totalCompleted}</span> of {totalLessons} lessons
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  <span className="font-semibold text-foreground">{completedModulesCount}</span> of 9 modules
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Module Accordions */}
        <div className="space-y-4">
          {orderedModules.map(([moduleSlug, moduleLessons], idx) => {
            const meta = CURRICULUM_MODULE_META[moduleSlug]
            const moduleNumber = idx + 1
            const ctaTarget = resolveModuleCtaTarget(moduleLessons, lessons, completedSet)
            const targetLesson = ctaTarget.lesson
            const completedInModule = moduleLessons.filter((l) => completedSet.has(l.id)).length
            const isModuleFullyCompleted =
              moduleLessons.length > 0 && completedInModule === moduleLessons.length
            const isModuleStarted = completedInModule > 0 && !isModuleFullyCompleted
            const modulePct =
              moduleLessons.length > 0 ? Math.round((completedInModule / moduleLessons.length) * 100) : 0

            const totalTime = moduleLessons.reduce(
              (sum, l) => sum + (l.estimatedCompletionTime ?? 30),
              0
            )
            const hours = Math.floor(totalTime / 60)
            const mins = totalTime % 60

            const isRecommended =
              personalizedPath.isPersonalized && moduleSlug === personalizedPath.recommendedModuleSlug

            return (
              <details
                key={moduleSlug}
                id={moduleSlug}
                className="group rounded-2xl border border-border bg-card hover:border-primary/40 transition-all shadow-xs open:shadow-sm open:border-border-strong scroll-mt-24 overflow-hidden"
              >
                <summary className="flex flex-col sm:flex-row sm:items-center justify-between p-5 md:p-6 cursor-pointer list-none select-none gap-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {/* High-craft React Lucide Icon badge */}
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
                      <CurriculumModuleIcon slugOrIcon={moduleSlug} className="w-6 h-6" />
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Module {String(moduleNumber).padStart(2, '0')}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-medium">• 10 Lessons</span>

                        {isModuleStarted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                            <Clock className="w-3 h-3" />
                            {completedInModule}/10 Done ({modulePct}%)
                          </span>
                        )}

                        {isRecommended && (
                          <span
                            data-testid="recommended-module-badge"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25"
                          >
                            <Sparkles className="w-3 h-3" />
                            Recommended for Your Goal
                          </span>
                        )}
                      </div>

                      <h2 className="text-base md:text-lg font-semibold text-foreground tracking-tight group-hover:text-primary transition-colors leading-snug flex items-center gap-2">
                        <span>{meta?.name ?? moduleSlug}</span>
                        {isModuleFullyCompleted && (
                          <span
                            title="Completed"
                            aria-label="Completed"
                            className="inline-flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0"
                          >
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                          </span>
                        )}
                      </h2>
                      {meta?.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {meta.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 sm:ml-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {hours > 0 ? `${hours}h ` : ''}
                      {mins > 0 ? `${mins}m` : ''}
                    </span>

                    {/* Mini module progress bar on desktop */}
                    <div className="hidden md:flex flex-col items-end gap-1 w-20">
                      <span className="text-[10px] font-mono text-muted-foreground">
                        {completedInModule}/10
                      </span>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${modulePct}%` }}
                        />
                      </div>
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:bg-muted transition-colors shrink-0">
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-open:rotate-90" />
                    </div>
                  </div>
                </summary>

                {/* Expanded Module Details & Playlist */}
                <div className="px-5 pb-6 md:px-6 md:pb-6 space-y-4 border-t border-border/60 pt-5 bg-muted/10">
                  {isRecommended && (
                    <div className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Focus area for: {personalizedPath.goalLabel}</span>
                    </div>
                  )}

                  {/* 10 Lessons Playlist Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {moduleLessons.map((lesson, lessonIdx) => {
                      const isDone = completedSet.has(lesson.id)
                      const isTargetLesson = targetLesson?.id === lesson.id && !isModuleFullyCompleted

                      return (
                        <Link
                          key={lesson.id}
                          href={`/academy/${lesson.module}/${lesson.id}`}
                          id={`lesson-link-${lesson.id}`}
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-xs md:text-sm group/item ${isTargetLesson
                              ? 'border-primary/50 bg-primary/5 shadow-xs'
                              : 'border-border/70 bg-card hover:bg-muted/40 hover:border-primary/30'
                            }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            {isDone ? (
                              <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                            ) : isTargetLesson ? (
                              <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-xs">
                                <PlayCircle className="w-3.5 h-3.5" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                                {String(lessonIdx + 1).padStart(2, '0')}
                              </div>
                            )}

                            <span
                              className={`truncate font-medium transition-colors ${isDone
                                  ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                                  : isTargetLesson
                                    ? 'text-foreground font-semibold group-hover/item:text-primary'
                                    : 'text-foreground group-hover/item:text-primary'
                                }`}
                            >
                              {lesson.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground font-mono">
                            <span>{lesson.estimatedReadingTime || 20}m</span>
                            <ArrowRight className="w-3.5 h-3.5 text-primary opacity-0 group-hover/item:opacity-100 group-hover/item:translate-x-0.5 transition-all" />
                          </div>
                        </Link>
                      )
                    })}
                  </div>

                  {/* Module Footer Action */}
                  {targetLesson && (
                    <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                      {isRecommended && !ctaTarget.isAccessible && ctaTarget.firstActionableLesson && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 leading-relaxed font-medium">
                          Prerequisites needed: Complete earlier modules in sequence first.
                        </div>
                      )}

                      <Link
                        href={
                          ctaTarget.isAccessible || isModuleFullyCompleted
                            ? `/academy/${targetLesson.module}/${targetLesson.id}`
                            : ctaTarget.firstActionableLesson
                              ? `/academy/${ctaTarget.firstActionableLesson.module}/${ctaTarget.firstActionableLesson.id}`
                              : `/academy/${targetLesson.module}/${targetLesson.id}`
                        }
                        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/90 shadow-xs active:scale-[0.98] transition-all sm:ml-auto"
                      >
                        <span>
                          {isModuleFullyCompleted
                            ? `Review Module ${moduleNumber}`
                            : ctaTarget.isAccessible
                              ? `Continue Module ${moduleNumber}: Lesson ${targetLesson.order}`
                              : ctaTarget.firstActionableLesson
                                ? `Start from Lesson ${ctaTarget.firstActionableLesson.order} first`
                                : `Continue Module ${moduleNumber}: Lesson ${targetLesson.order}`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </details>
            )
          })}
        </div>
      </div>
    </>
  )
}

