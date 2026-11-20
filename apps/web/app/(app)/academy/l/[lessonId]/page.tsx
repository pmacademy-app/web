/**
 * /academy/l/[lessonId] — Legacy Lesson Page Redirect
 *
 * Preserves user bookmarks by redirecting them to the canonical
 * /academy/[moduleSlug]/[lessonId] route.
 */

import { notFound, redirect } from 'next/navigation'
import { fetchCompiledLesson } from '@/lib/lesson-loader'
import { lessonPath } from '@/lib/curriculum/lesson-url'

interface PageProps {
  params: Promise<{ lessonId: string }>
}

export default async function LegacyLessonRedirectPage({ params }: PageProps) {
  const { lessonId } = await params
  const lesson = await fetchCompiledLesson(lessonId)
  if (!lesson) notFound()

  redirect(lessonPath(lesson.module, lesson.id))
}
