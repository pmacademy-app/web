'use client'

import { useState, useEffect, useCallback } from 'react'

export interface LessonProgressV2 {
  status: 'not_started' | 'in_progress' | 'completed'
  theory_read_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  xp_earned: number
  completed_at: string | null
}

/**
 * Hook for managing lesson progress state in the v2 /academy/** route.
 *
 * Uses stable les_XXXXXX lesson IDs and calls /api/v2/lessons/[lessonId]/*
 * endpoints which query the `lesson_id` column.
 *
 * This is the v2 replacement for useLessonProgress(slug) in hooks/use-lesson-progress.ts.
 * The old hook is preserved for backward compatibility with the v1 route.
 */
export function useLessonProgressV2(lessonId: string) {
  const [progress, setProgress] = useState<LessonProgressV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/lessons/${lessonId}/progress`)
      if (!res.ok) throw new Error('Failed to fetch progress')
      const data = await res.json()
      setProgress(data)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error fetching progress'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProgress()
  }, [fetchProgress])

  const markInProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/lessons/${lessonId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      if (!res.ok) throw new Error('Failed to update status to in_progress')
      const data = await res.json()
      setProgress((prev) => (prev ? { ...prev, status: data.status } : data))
    } catch (err) {
      console.error('[use-lesson-progress-v2] markInProgress error:', err)
    }
  }, [lessonId])

  const recordTheoryRead = useCallback(
    async (activeSeconds: number, scrollPercentage: number) => {
      const res = await fetch(`/api/v2/lessons/${lessonId}/theory-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active_seconds: activeSeconds,
          scroll_percentage: scrollPercentage,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record theory read')
      }
      await fetchProgress()
      return data
    },
    [lessonId, fetchProgress]
  )

  const recordQuizAttempt = useCallback(
    async (
      attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
    ) => {
      const res = await fetch(`/api/v2/lessons/${lessonId}/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempts }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record quiz attempt')
      }
      await fetchProgress()
      return data
    },
    [lessonId, fetchProgress]
  )

  return {
    progress,
    loading,
    error,
    refetch: fetchProgress,
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
  }
}
