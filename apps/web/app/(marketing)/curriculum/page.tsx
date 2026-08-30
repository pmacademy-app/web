import type { Metadata } from 'next'
import Link from 'next/link'
import { MODULES } from '@/config/content'
import { BRAND } from '@/lib/brand'
import { fetchCurriculumData } from '@/lib/lesson-loader'
import { getCourseSchema } from '@/lib/schema'
import { ArrowRight, BookOpen, Clock } from 'lucide-react'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Full Curriculum — 9 Modules, 90 Lessons — Prodily PM Academy',
  description:
    'Explore all 90 Product Management lessons across 9 core modules. Business-school caliber strategy, discovery, execution, leadership, and portfolio capstones.',
  alternates: {
    canonical: `${siteUrl}/curriculum`,
  },
  openGraph: {
    title: 'Full PM Curriculum — 9 Modules, 90 Lessons',
    description: 'Explore the complete free 90-lesson Product Management curriculum.',
    url: `${siteUrl}/curriculum`,
    type: 'website',
    images: [
      {
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: 'Prodily PM Academy Curriculum',
      },
    ],
  },
}

function getModuleSlugByNumber(num: number): string {
  const map: Record<number, string> = {
    1: 'foundations',
    2: 'discovery',
    3: 'strategy',
    4: 'execution',
    5: 'design',
    6: 'growth',
    7: 'technical',
    8: 'leadership',
    9: 'capstone',
  }
  return map[num] ?? `module-${num}`
}

export default async function CurriculumPage() {
  const [curriculumData, courseSchema] = await Promise.all([
    fetchCurriculumData(),
    Promise.resolve(getCourseSchema()),
  ])

  const allLessons = curriculumData?.lessons ?? []

  return (
    <div className="container mx-auto px-4 pt-24 pb-16 lg:pt-28 lg:pb-20 max-w-5xl space-y-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(courseSchema) }}
      />

      {/* Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-wider text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
          Complete Learning Path
        </span>
        <h1 className="text-3xl md:text-5xl font-bold font-serif text-foreground">
          Full PM Curriculum
        </h1>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          9 modules, 90 lessons, 9 applied capstones. Rigorous, structured, and free forever with zero paywalls.
        </p>
      </div>

      {/* 9 Modules List with All 90 Direct Lesson Links */}
      <div className="space-y-10">
        {MODULES.map((module) => {
          const moduleSlug = getModuleSlugByNumber(module.number)
          const startIdx = (module.number - 1) * 10
          const moduleLessons = allLessons.slice(startIdx, startIdx + 10)

          return (
            <section
              key={module.number}
              id={`module-${moduleSlug}`}
              aria-labelledby={`heading-module-${module.number}`}
              className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-xs transition-all hover:border-primary/40 scroll-mt-28"
            >
              {/* Module Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border">
                <div>
                  <span className="text-xs uppercase tracking-wider font-bold text-primary">
                    Module {String(module.number).padStart(2, '0')}
                  </span>
                  <h2
                    id={`heading-module-${module.number}`}
                    className="text-2xl md:text-3xl font-bold font-serif text-foreground mt-1"
                  >
                    {module.title}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground font-medium">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary" />
                    {module.estimatedTime}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-primary" />
                    10 Lessons
                  </span>
                </div>
              </div>

              {/* Module Metadata */}
              <div className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-muted-foreground border-b border-border/50">
                <p className="font-medium text-foreground/90">
                  Learning Outcome:{' '}
                  <span className="font-normal text-muted-foreground">{module.outcome}</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {module.skillLabels.map((label) => (
                    <span
                      key={label}
                      className="inline-flex items-center rounded-md bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* All 10 Lessons Grid for this Module */}
              <div className="pt-6 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Module Lessons (10 Direct Links)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {moduleLessons.map((lesson, idx) => {
                    const globalOrder = startIdx + idx + 1
                    return (
                      <Link
                        key={lesson.id || lesson.slug}
                        href={`/lessons/${lesson.slug}`}
                        className="p-3.5 rounded-xl border border-border/80 bg-background/60 hover:bg-muted/60 hover:border-primary/50 transition-all flex items-center justify-between group text-xs md:text-sm"
                      >
                        <div className="flex items-center gap-3 min-w-0 pr-2">
                          <span className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                            {globalOrder}
                          </span>
                          <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                            {lesson.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
                          <span>{lesson.estimatedReadingTime || 20}m</span>
                          <ArrowRight className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
