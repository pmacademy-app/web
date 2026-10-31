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
import { getServerUser, getCurrentUserProfile } from '@/lib/auth'
import { resolveLessonAccessForUser } from '@/lib/lessons-completion-service'
import { isModuleEntryUnlockTreatment } from '@/lib/academy/module-entry-unlock'
import { getRecutVariant } from '@/lib/academy/experiment'
import { withSampledQuiz } from '@/lib/academy/lesson-structure'
import { BRAND } from '@/lib/brand'
import { safeJsonLd } from '@/lib/seo/safe-json-ld'
import { getModuleTitle } from '@/lib/curriculum/module-meta'
import { getLessonPosition } from '@/lib/curriculum/lesson-position'
import LessonPageContent from './lesson-content'

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonId: string }>
}

const SAMPLE_LESSON_IDS = ['les_zoyq8a', 'les_prrl23', 'les_0q4aih']

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
  const description = `Lesson ${globalOrder}: ${lesson.title}, part of the ${getModuleTitle(lesson.module)} module. Includes theory, interactive quiz, spaced repetition flashcards, and reflection exercise.`
  const isSample = SAMPLE_LESSON_IDS.includes(lessonId)

  return {
    title: `Lesson ${globalOrder}: ${lesson.title}`,
    description,
    // Only public sample lessons should be indexed
    robots: isSample ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: `Lesson ${globalOrder}: ${lesson.title} | Prodily`,
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
    redirect(`/login?next=${encodeURIComponent(`/academy/${lesson.module}/${lesson.id}`)}`)
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

  // Display position (UX-05): "Module 3 · Lesson 2" with the module title from MODULE_META.
  // The global index above stays for URLs, metadata and JSON-LD only.
  const position = getLessonPosition(lesson, curriculum)

  let isLocked = false

  // Prerequisite for the locked-screen message — a concrete lesson id from the access
  // resolver (module-scoped under treatment, first incomplete global lesson under control).
  const lastPrereqIndex: number = globalIndex - 1 // = targetIndex - 1
  let firstIncompletePrereqMeta: typeof prevMeta | null = null
  let firstIncompletePrereqGlobalOrder: number | null = null
  let firstIncompletePrereqUrl: string | null = null

  let initialProgress: {
    status: 'not_started' | 'in_progress' | 'completed'
    theory_read_at: string | null
    quiz_score: number | null
    quiz_attempts: number
    xp_earned: number
    completed_at: string | null
  } | null = null

  if (user) {
    const serviceSupabase = createServiceRoleClient()

    // Phase 6: resolve the experiment variant (control unless the flag is enabled for this
    // learner's new-signup cohort) and the access decision under the module-entry unlock model.
    // Control reproduces the pre-Phase-6 global-sequential gate exactly; opened lessons stay
    // accessible under both arms (grandfathering).
    const profile = await getCurrentUserProfile()
    const treatment = isModuleEntryUnlockTreatment({ id: user.id, createdAt: profile?.created_at })

    const [access, progressResult] = await Promise.all([
      resolveLessonAccessForUser(serviceSupabase, user.id, lessonId, {
        curriculum: lessons,
        treatment,
      }),
      serviceSupabase
        .from('user_lesson_progress')
        .select('status, theory_read_at, quiz_score, quiz_attempts, xp_earned, completed_at')
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId)
        .maybeSingle(),
    ])

    if (!access.isAccessible) {
      isLocked = true

      // The prerequisite lesson to complete: the module-scoped previous lesson under treatment,
      // or the first incomplete lesson in the global sequence under control. Either way it is a
      // concrete, existing lesson. `lastPrereqIndex` stays the immediately-previous global lesson
      // so the control arm still renders the familiar "Lessons X–Y" range, while treatment (where
      // the prerequisite IS the previous lesson) collapses to a single-lesson message.
      const prereqId = access.prerequisiteLessonId
      if (prereqId) {
        const prereqGlobalIdx = lessons.findIndex((l) => l.id === prereqId)
        firstIncompletePrereqMeta = await getLessonMeta(prereqId)
        firstIncompletePrereqGlobalOrder = prereqGlobalIdx >= 0 ? prereqGlobalIdx + 1 : null
        firstIncompletePrereqUrl = firstIncompletePrereqMeta
          ? `/academy/${firstIncompletePrereqMeta.module}/${firstIncompletePrereqMeta.id}`
          : null
      } else {
        // No specific prerequisite id (defensive) — fall back to the previous global lesson.
        firstIncompletePrereqMeta = prevMeta
        firstIncompletePrereqGlobalOrder = prevGlobalOrder
        firstIncompletePrereqUrl = prevLessonUrl
      }
    }

    if (progressResult?.data) {
      const row = progressResult.data as {
        status: 'not_started' | 'in_progress' | 'completed'
        theory_read_at: string | null
        quiz_score: number | null
        quiz_attempts: number
        xp_earned: number
        completed_at: string | null
      }
      initialProgress = row
    } else {
      initialProgress = {
        status: 'not_started',
        theory_read_at: null,
        quiz_score: null,
        quiz_attempts: 0,
        xp_earned: 0,
        completed_at: null,
      }
    }
  }

  // 5. Render locked screen if prerequisite is unmet
  if (isLocked) {
    // Determine whether to display a range ("Lessons X–Y") or a single lesson
    const lastPrereqGlobalOrder = lastPrereqIndex >= 0 ? lastPrereqIndex + 1 : null
    const showRange =
      firstIncompletePrereqGlobalOrder !== null &&
      lastPrereqGlobalOrder !== null &&
      firstIncompletePrereqGlobalOrder < lastPrereqGlobalOrder
    // Learner-facing numbers use the module-local "Module N · Lesson M" scheme (UX-05).
    const prereqLabel = firstIncompletePrereqMeta
      ? getLessonPosition(firstIncompletePrereqMeta, curriculum).label
      : null
    const lastPrereqEntry = lastPrereqIndex >= 0 ? lessons[lastPrereqIndex] : null
    const lastPrereqLabel = lastPrereqEntry ? getLessonPosition(lastPrereqEntry, curriculum).label : null

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
            {showRange && prereqLabel && lastPrereqLabel ? (
              // Range display: "Complete Module 1 · Lesson 1 through Module 1 · Lesson 10
              // before unlocking Module 2 · Lesson 1: Title"
              <>
                You must complete{' '}
                <span className="font-semibold text-foreground">
                  {prereqLabel} through {lastPrereqLabel}
                </span>{' '}
                before you can unlock{' '}
                <span className="font-semibold text-foreground">
                  {position.label}: {lesson.title}
                </span>
                .
              </>
            ) : (
              // Single lesson display: "Complete Module 1 · Lesson 3: Title before unlocking ..."
              <>
                You must complete{' '}
                {firstIncompletePrereqMeta && prereqLabel && (
                  <span className="font-semibold text-foreground">
                    {prereqLabel}: {firstIncompletePrereqMeta.title}
                  </span>
                )}{' '}
                before you can unlock{' '}
                <span className="font-semibold text-foreground">
                  {position.label}: {lesson.title}
                </span>
                .
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {firstIncompletePrereqUrl && firstIncompletePrereqMeta && prereqLabel && (
            <Link
              href={firstIncompletePrereqUrl}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
            >
              Start {prereqLabel}: {firstIncompletePrereqMeta.title} →
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

  // 6. Phase 4 — resolve the A/B variant (deterministic per user; control when the
  //    experiment flag is off) and, for treatment, replace the 15-question quiz with a
  //    stable 5-question sample seeded by "<userId>:<lessonId>". The sampling is done on a
  //    shallow clone (withSampledQuiz) so the shared/cached compiled lesson is never mutated;
  //    the full 15-question pool stays on disk and the quiz route still validates every
  //    submitted answer against it. Sample lessons (no user) stay control / full pool.
  const recutVariant = getRecutVariant(user?.id ?? null)
  const renderedLesson =
    recutVariant === 'treatment'
      ? withSampledQuiz(lesson, `${user?.id ?? 'anon'}:${lessonId}`)
      : lesson

  // 7. Render lesson content via the v2 client shell
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? BRAND.siteUrl
  const lessonUrl = `${siteUrl}/academy/${lesson.module}/${lessonId}`

  const articleJsonLd = isSampleLesson ? {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: lesson.title,
    description: `Learn about ${lesson.title}, part of the free ${getModuleTitle(lesson.module)} curriculum.`,
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
          dangerouslySetInnerHTML={{ __html: safeJsonLd(articleJsonLd) }}
        />
      )}
      <LessonPageContent
        lesson={renderedLesson}
        prevLessonUrl={prevLessonUrl}
        nextLessonUrl={nextLessonUrl}
        nextLessonTitle={nextMeta?.title ?? null}
        globalOrder={globalOrder}
        moduleNumber={position.moduleNumber}
        moduleLessonNumber={position.lessonNumber}
        moduleName={position.moduleTitle}
        initialProgress={initialProgress}
        recutVariant={recutVariant}
      />
    </>
  )
}
