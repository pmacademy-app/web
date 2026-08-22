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
export function useLessonProgressV2(lessonId: string, initialProgress?: LessonProgressV2 | null) {
  const [progress, setProgress] = useState<LessonProgressV2 | null>(initialProgress ?? null)
  const [loading, setLoading] = useState(!initialProgress)
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
    if (!initialProgress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchProgress()
    }
  }, [fetchProgress, initialProgress])

  const markInProgress = useCallback(async () => {
    try {
      setProgress((prev) => (prev ? { ...prev, status: 'in_progress' } : prev))
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
    async (activeSeconds?: number, scrollPercentage?: number) => {
      const prevProgress = progress
      const nowIso = new Date().toISOString()
      setProgress((prev) => (prev ? { ...prev, theory_read_at: nowIso } : prev))

      try {
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
        void fetchProgress()
        return data
      } catch (err) {
        setProgress(prevProgress)
        throw err
      }
    },
    [lessonId, progress, fetchProgress]
  )

  const recordQuizAttempt = useCallback(
    async (
      attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
    ) => {
      const prevProgress = progress
      // Immediate optimistic unlock
      const nowIso = new Date().toISOString()
      setProgress((prev) => (prev ? { ...prev, status: 'completed', completed_at: nowIso } : prev))

      try {
        const res = await fetch(`/api/v2/lessons/${lessonId}/quiz`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attempts }),
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || 'Failed to record quiz attempt')
        }

        // Sync computed fields
        setProgress((prev) => (prev ? {
          ...prev,
          status: 'completed',
          quiz_score: typeof data.scorePercentage === 'number' ? data.scorePercentage : prev.quiz_score,
          xp_earned: (prev.xp_earned || 0) + (data.xpEarned || 0),
          completed_at: prev.completed_at || nowIso,
        } : prev))

        void fetchProgress()
        return data
      } catch (err) {
        // Rollback optimistic state on API rejection
        setProgress(prevProgress)
        throw err
      }
    },
    [lessonId, progress, fetchProgress]
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
