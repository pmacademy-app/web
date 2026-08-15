import React from 'react'
import { notFound } from 'next/navigation'
import { CurriculumService } from '@/lib/admin/curriculum-service'
import { fetchCurriculumData, getAdjacentLessons } from '@/lib/lesson-loader'
import { AdminLessonDetailView } from '@/components/admin/AdminLessonDetailView'

export const revalidate = 0

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonId: string }>
}

export default async function AdminLessonDetailPage({ params }: PageProps) {
  const { lessonId } = await params
  const { lesson, failed } = await CurriculumService.getLessonDetail(lessonId)
  if (!lesson) notFound()

  // Resolve prev/next URLs with the correct module slug for each adjacent
  // lesson (adjacent lessons can cross module boundaries).
  const [curriculum, { prevId, nextId }] = await Promise.all([
    fetchCurriculumData(),
    getAdjacentLessons(lessonId),
  ])
  const lessonById = new Map((curriculum?.lessons || []).map((l) => [l.id, l]))
  const prevModule = prevId ? lessonById.get(prevId)?.module : undefined
  const nextModule = nextId ? lessonById.get(nextId)?.module : undefined
  const prevLessonUrl = prevId && prevModule ? `/admin/curriculum/${prevModule}/${prevId}` : null
  const nextLessonUrl = nextId && nextModule ? `/admin/curriculum/${nextModule}/${nextId}` : null

  return (
    <AdminLessonDetailView
      lesson={lesson}
      prevLessonUrl={prevLessonUrl}
      nextLessonUrl={nextLessonUrl}
      totalLessons={curriculum?.lessons.length || 0}
      initialLoadFailed={failed}
    />
  )
}