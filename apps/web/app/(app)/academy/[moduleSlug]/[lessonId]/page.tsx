/**
 * /academy/[moduleSlug]/[lessonId] — v2 Lesson Page (Server Component)
 *
 * Renders a single lesson by its stable les_XXXXXX ID and verifies module slug matches.
 *
 * References: rendering-pipeline.md §2.2, Architecture.md §5
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import {
  fetchCompiledLesson,
  fetchCurriculumData,
  getAdjacentLessons,
  getLessonMeta,
} from '@/lib/lesson-loader'
import { createServiceRoleClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { isLessonUnlocked, getFirstLockedLessonIndex } from '@/lib/lessons-completion-service'
import { BRAND } from '@/lib/brand'
import LessonPageContent from './lesson-content'

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonId: string }>
}

const SAMPLE_LESSON_IDS = ['les_zoyq8a', 'les_prrl23', 'les_0q4aih']

const MODULE_LABEL: Record<string, string> = {
  foundations: 'Product Thinking Foundations',
  discovery: 'Discovery & User Research',
  strategy: 'Product Strategy',
  execution: 'Product Execution',
  growth: 'Growth & Metrics',
  leadership: 'PM Leadership',
  technical: 'Technical Fundamentals for PMs',
  design: 'Design Thinking & UX',
  capstone: 'Capstone & Career Portfolio',
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonId } = await params
  const [lesson, curriculum] = await Promise.all([
    fetchCompiledLesson(lessonId),
    fetchCurriculumData(),
  ])
  if (!lesson) return { title: 'Lesson Not Found' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl
  const globalIndex = curriculum?.lessons.findIndex((l) => l.id === lessonId) ?? -1
  const globalOrder = globalIndex >= 0 ? globalIndex + 1 : lesson.order
  const lessonUrl = `${siteUrl}/academy/${lesson.module}/${lessonId}`
  const description = `Lesson ${globalOrder}: ${lesson.title} — part of the ${MODULE_LABEL[lesson.module] ?? lesson.module} module. Includes theory, interactive quiz, spaced repetition flashcards, and reflection exercise.`
  const isSample = SAMPLE_LESSON_IDS.includes(lessonId)

  return {
    title: `Lesson ${globalOrder}: ${lesson.title}`,
    description,
    // Only public sample lessons should be indexed
    robots: isSample ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: `Lesson ${globalOrder}: ${lesson.title} | Prodily PM Academy`,
      description,
      url: lessonUrl,
      type: 'article',
      images: [{
        url: BRAND.assets.ogImage,
        width: BRAND.assets.ogImageDimensions.width,
        height: BRAND.assets.ogImageDimensions.height,
        alt: lesson.title,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Lesson ${globalOrder}: ${lesson.title}`,
      description,
      images: [BRAND.assets.ogImage],
    },
  }
}

export default async function AcademyLessonPage({ params }: PageProps) {
  const { moduleSlug, lessonId } = await params

  // 1. Load compiled lesson data
  const lesson = await fetchCompiledLesson(lessonId)
  if (!lesson) notFound()

  // 2. Redirect to canonical URL if the moduleSlug parameter doesn't match the lesson's actual module
  if (lesson.module !== moduleSlug) {
    redirect(`/academy/${lesson.module}/${lesson.id}`)
  }

  // 3. Auth verification & sample lesson handling
  const user = await getServerUser()
  const isSampleLesson = SAMPLE_LESSON_IDS.includes(lessonId)

  if (!user && !isSampleLesson) {
    redirect('/login')
  }

  // 4. Sequential unlock check using stable IDs from global curriculum array
  //    getAdjacentLessons uses curriculum.lessons array index — always global order
  const { prevId, nextId } = await getAdjacentLessons(lessonId)
  const [prevMeta, nextMeta, curriculum] = await Promise.all([
    prevId ? getLessonMeta(prevId) : null,
    nextId ? getLessonMeta(nextId) : null,
    fetchCurriculumData(),
  ])

  const prevLessonUrl = prevMeta ? `/academy/${prevMeta.module}/${prevMeta.id}` : null
  const nextLessonUrl = nextMeta ? `/academy/${nextMeta.module}/${nextMeta.id}` : null

  // Compute the global 1-indexed lesson numbers for display (not module-scoped order)
  const lessons = curriculum?.lessons ?? []
  const globalIndex = lessons.findIndex((l) => l.id === lessonId)
  const globalOrder = globalIndex >= 0 ? globalIndex + 1 : lesson.order

  const prevGlobalIndex = prevMeta ? lessons.findIndex((l) => l.id === prevMeta.id) : -1
  const prevGlobalOrder = prevGlobalIndex >= 0 ? prevGlobalIndex + 1 : null

  // Human-readable module name
  const MODULE_NAMES: Record<string, string> = {
    foundations: 'Foundations',
    discovery: 'Discovery & User Research',
    strategy: 'Product Strategy',
    execution: 'Product Execution',
    growth: 'Growth & Metrics',
    leadership: 'PM Leadership',
    technical: 'Technical Fundamentals',
    design: 'Design Thinking',
    capstone: 'Capstone Projects',
  }
  const moduleName = MODULE_NAMES[lesson.module] ?? lesson.module
  const moduleNum = Math.ceil(globalOrder / 10)

  let isLocked = false
  let lowestLockedLessonMeta: typeof prevMeta | null = null
  let lowestLockedGlobalOrder: number | null = null
  let lowestLockedLessonUrl: string | null = null

  if (user && prevId) {
    const serviceSupabase = createServiceRoleClient()
    const unlocked = await isLessonUnlocked(serviceSupabase, user.id, lessonId, prevId)
    if (!unlocked) {
      isLocked = true
      
      const curriculumIds = lessons.map(l => l.id)
      const lowestLockedIndex = await getFirstLockedLessonIndex(serviceSupabase, user.id, curriculumIds)
      
      if (lowestLockedIndex !== -1 && lowestLockedIndex < globalIndex) {
        const actualLockedLesson = lessons[lowestLockedIndex]
        if (actualLockedLesson) {
          lowestLockedLessonMeta = await getLessonMeta(actualLockedLesson.id)
          lowestLockedGlobalOrder = lowestLockedIndex + 1
          lowestLockedLessonUrl = lowestLockedLessonMeta ? `/academy/${lowestLockedLessonMeta.module}/${lowestLockedLessonMeta.id}` : null
        }
      }
    }
  }

  if (isLocked && !lowestLockedLessonMeta) {
    lowestLockedLessonMeta = prevMeta
    lowestLockedGlobalOrder = prevGlobalOrder
    lowestLockedLessonUrl = prevLessonUrl
  }

  // 5. Render locked screen if prerequisite is unmet
  if (isLocked) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-xl text-center space-y-8 animate-fade-in">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Lock className="h-8 w-8" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold font-serif text-foreground">Lesson Locked</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
            {lowestLockedGlobalOrder && prevGlobalOrder && lowestLockedGlobalOrder < prevGlobalOrder ? (
              <>
                You must complete{' '}
                <span className="font-semibold text-foreground">
                  Lesson {lowestLockedGlobalOrder}
                </span>{' '}
                through{' '}
                <span className="font-semibold text-foreground">
                  Lesson {prevGlobalOrder}
                </span>{' '}
                before you can unlock{' '}
                <span className="font-semibold text-foreground">
                  Lesson {globalOrder}: {lesson.title}
                </span>
                .
              </>
            ) : (
              <>
                You must complete{' '}
                {prevMeta && prevGlobalOrder && (
                  <span className="font-semibold text-foreground">
                    Lesson {prevGlobalOrder}: {prevMeta.title}
                  </span>
                )}{' '}
                before you can unlock{' '}
                <span className="font-semibold text-foreground">
                  Lesson {globalOrder}: {lesson.title}
                </span>
                .
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {lowestLockedLessonUrl && lowestLockedLessonMeta && lowestLockedGlobalOrder && (
            <Link
              href={lowestLockedLessonUrl}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
            >
              Start Lesson {lowestLockedGlobalOrder}: {lowestLockedLessonMeta.title} →
            </Link>
          )}
          <Link
            href="/academy"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            Return to Curriculum
          </Link>
        </div>
      </div>
    )
  }

  // 6. Render lesson content via the v2 client shell
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl
  const lessonUrl = `${siteUrl}/academy/${lesson.module}/${lessonId}`

  const articleJsonLd = isSampleLesson ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: lesson.title,
    description: `Learn about ${lesson.title} — part of the free ${MODULE_LABEL[lesson.module] ?? lesson.module} curriculum.`,
    url: lessonUrl,
    image: `${siteUrl}${BRAND.assets.ogImage}`,
    author: {
      '@type': 'Organization',
      name: BRAND.fullName,
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: BRAND.fullName,
      url: siteUrl,
    },
    isPartOf: {
      '@type': 'Course',
      name: BRAND.fullName,
      url: `${siteUrl}/academy`,
      provider: {
        '@type': 'Organization',
        name: BRAND.fullName,
      },
    },
    position: globalOrder,
  } : null

  return (
    <>
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      <LessonPageContent
        lesson={lesson}
        prevLessonUrl={prevLessonUrl}
        nextLessonUrl={nextLessonUrl}
        globalOrder={globalOrder}
        moduleNumber={moduleNum}
        moduleName={moduleName}
      />
    </>
  )
}
