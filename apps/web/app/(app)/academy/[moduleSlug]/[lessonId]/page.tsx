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
import { fetchCompiledLesson, getAdjacentLessons, getLessonMeta } from '@/lib/lesson-loader'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getServerUser } from '@/lib/auth'
import { isLessonUnlocked } from '@/lib/lessons-completion-service'
import LessonPageContent from './lesson-content'

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonId } = await params
  const lesson = await fetchCompiledLesson(lessonId)
  if (!lesson) return { title: 'Lesson Not Found | PM Academy' }

  return {
    title: `Lesson ${lesson.order}: ${lesson.title} | PM Academy`,
    description: `Interactive lesson — theory, practice quiz, spaced repetition flashcards, and reflection exercise.`,
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

  // 3. Auth verification
  const user = await getServerUser()
  if (!user) redirect('/login')

  // 4. Sequential unlock check using stable IDs
  const { prevId, nextId } = await getAdjacentLessons(lessonId)
  const [prevMeta, nextMeta] = await Promise.all([
    prevId ? getLessonMeta(prevId) : null,
    nextId ? getLessonMeta(nextId) : null,
  ])

  const prevLessonUrl = prevMeta ? `/academy/${prevMeta.module}/${prevMeta.id}` : null
  const nextLessonUrl = nextMeta ? `/academy/${nextMeta.module}/${nextMeta.id}` : null

  let isLocked = false
  if (prevId) {
    const serviceSupabase = createServerSupabaseClient()
    const unlocked = await isLessonUnlocked(serviceSupabase, user.id, lessonId, prevId)
    if (!unlocked) {
      isLocked = true
    }
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
            You must complete the previous lesson before unlocking{' '}
            <span className="font-semibold text-foreground">
              Lesson {lesson.order}: {lesson.title}
            </span>
            .
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {prevLessonUrl && (
            <Link
              href={prevLessonUrl}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
            >
              Go to Required Lesson →
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
  return (
    <LessonPageContent
      lesson={lesson}
      prevLessonUrl={prevLessonUrl}
      nextLessonUrl={nextLessonUrl}
    />
  )
}
