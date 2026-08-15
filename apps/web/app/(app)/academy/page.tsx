import type { Metadata } from 'next'
import Link from 'next/link'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import type { CurriculumEntry } from '@/types'
import { BookOpen, Clock, ChevronRight, GraduationCap, Layers } from 'lucide-react'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { BRAND } from '@/lib/brand'

export const metadata: Metadata = {
  title: 'Curriculum',
  description: 'All 90 PM Academy lessons across 9 modules — theory, quizzes, flashcards, and reflections.',
}

const MODULE_META: Record<string, {
  name: string
  description: string
  color: string
  accentBorder: string
  icon: string
}> = {
  'foundations': {
    name: 'Product Thinking Foundations',
    description: 'Core PM concepts, the product mindset, user vs. customer, Jobs to Be Done, and the fundamental frameworks every PM must know.',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
    accentBorder: 'border-l-violet-500',
    icon: '🧠',
  },
  'discovery': {
    name: 'Users, Problems & Discovery',
    description: 'User research methods, problem framing, opportunity identification, and how to build real understanding before committing to a solution.',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    accentBorder: 'border-l-blue-500',
    icon: '🔍',
  },
  'strategy': {
    name: 'Product Strategy',
    description: 'Vision setting, prioritization frameworks, roadmap planning, competitive thinking, and how to make sound trade-off decisions.',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    accentBorder: 'border-l-emerald-500',
    icon: '🎯',
  },
  'execution': {
    name: 'Product Execution',
    description: 'Agile methodologies, writing PRDs, cross-functional collaboration, sprint planning, and how to ship effectively with an engineering team.',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    accentBorder: 'border-l-amber-500',
    icon: '⚙️',
  },
  'growth': {
    name: 'Growth & Metrics',
    description: 'Product analytics, experimentation, A/B testing, funnels, growth loops, and how to measure what actually matters.',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
    accentBorder: 'border-l-red-500',
    icon: '📈',
  },
  'leadership': {
    name: 'PM Leadership',
    description: 'Influence without authority, stakeholder management, executive communication, managing up, and building your PM career.',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    accentBorder: 'border-l-indigo-500',
    icon: '👥',
  },
  'technical': {
    name: 'Technical Fluency for PMs',
    description: 'APIs, databases, system architecture basics, data pipelines, and how to have credible technical conversations with engineering teams.',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
    accentBorder: 'border-l-teal-500',
    icon: '💻',
  },
  'design': {
    name: 'Design Thinking & UX',
    description: 'UX principles, design collaboration, wireframing, prototyping, and how to make user-centred product decisions.',
    color: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20',
    accentBorder: 'border-l-pink-500',
    icon: '🎨',
  },
  'capstone': {
    name: 'Capstone & Career Portfolio',
    description: 'Applied portfolio projects, interview preparation, case studies, and building interview-ready PM artifacts demonstrating full-cycle product mastery.',
    color: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
    accentBorder: 'border-l-yellow-500',
    icon: '🏆',
  },
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

  // Fetch completed lessons for current user
  let completedSet = new Set<string>()
  if (user) {
    const supabase = createServiceRoleClient()
    const { data: rows } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', user.id)
      .eq('status', 'completed')
    if (rows) {
      completedSet = new Set((rows as { lesson_id: string }[]).map((r) => r.lesson_id))
    }
  }

  const orderedModules = [...byModule.entries()].sort(
    ([, a], [, b]) => (a[0]?.order ?? 0) - (b[0]?.order ?? 0)
  )

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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseJsonLd) }}
      />
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Page Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            PM Academy Curriculum
          </span>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
          All 90 Lessons
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          A complete curriculum from PM fundamentals to advanced execution — 9 modules, 10 lessons each,
          with theory, practice quiz, spaced repetition flashcards, and a capstone project per module.
        </p>

        {/* Quick stats */}
        <div className="flex flex-wrap items-center gap-4 pt-2">
          {[
            { icon: Layers, label: '9 Modules' },
            { icon: BookOpen, label: '90 Lessons' },
            { icon: Clock, label: '~45 Hours Total' },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Module Cards */}
      <div className="space-y-4">
        {orderedModules.map(([moduleSlug, moduleLessons], idx) => {
          const meta = MODULE_META[moduleSlug]
          const moduleNumber = idx + 1
          const uncompletedLesson = moduleLessons.find((l) => !completedSet.has(l.id))
          const targetLesson = uncompletedLesson ?? moduleLessons[0]
          const isModuleFullyCompleted = moduleLessons.length > 0 && moduleLessons.every((l) => completedSet.has(l.id))

          const totalTime = moduleLessons.reduce(
            (sum, l) => sum + (l.estimatedCompletionTime ?? 30),
            0
          )
          const hours = Math.floor(totalTime / 60)
          const mins = totalTime % 60

          return (
            <details
              key={moduleSlug}
              id={moduleSlug}
              className={`rounded-xl border-l-4 ${meta?.accentBorder ?? 'border-l-border'} border border-border bg-card shadow-sm group open:shadow-md transition-shadow scroll-mt-6`}
            >
              <summary
                className="flex items-center justify-between p-5 cursor-pointer list-none select-none hover:bg-accent/20 transition-colors rounded-xl"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-2xl shrink-0" role="img" aria-hidden>
                    {meta?.icon ?? '📚'}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
                          meta?.color ?? 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        Module {String(moduleNumber).padStart(2, '0')}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {moduleLessons.length} lessons
                      </span>
                      {isModuleFullyCompleted && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    <h2 className="text-base font-bold font-serif text-foreground mt-1 leading-snug truncate">
                      {meta?.name ?? moduleSlug}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {hours > 0 ? `${hours}h ` : ''}{mins > 0 ? `${mins}m` : ''}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90" />
                </div>
              </summary>

              <div className="px-5 pb-5 space-y-4 border-t border-border/60 pt-4">
                {meta?.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                    {meta.description}
                  </p>
                )}

                <div className="rounded-lg border border-border overflow-hidden">
                  {moduleLessons.map((lesson, lessonIdx) => {
                    const isDone = completedSet.has(lesson.id)
                    return (
                      <Link
                        key={lesson.id}
                        href={`/academy/${lesson.module}/${lesson.id}`}
                        className="flex items-center justify-between px-4 py-3 hover:bg-accent/30 transition-colors group border-b border-border/60 last:border-0"
                        id={`lesson-link-${lesson.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-muted-foreground shrink-0 w-6 text-right">
                            {isDone ? '✓' : lessonIdx + 1}
                          </span>
                          <span className={`text-sm ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'} group-hover:text-primary transition-colors truncate`}>
                            {lesson.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <span className="text-[11px] text-muted-foreground">
                            {lesson.estimatedReadingTime}m
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </Link>
                    )
                  })}
                </div>

                {targetLesson && (
                  <Link
                    href={`/academy/${targetLesson.module}/${targetLesson.id}`}
                    className={`inline-flex items-center justify-between w-full sm:w-auto sm:px-6 px-4 py-2.5 rounded-lg border font-bold text-xs transition-colors ${
                      meta?.color ?? 'bg-muted text-muted-foreground border-border'
                    } hover:opacity-80`}
                  >
                    <span>
                      {isModuleFullyCompleted
                        ? `Review Module ${moduleNumber}`
                        : `Continue Module ${moduleNumber} → Lesson ${targetLesson.order}`}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 ml-2" />
                  </Link>
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
