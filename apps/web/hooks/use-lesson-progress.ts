'use client'

import { useState, useEffect, useCallback } from 'react'

export interface LessonProgress {
  status: 'not_started' | 'in_progress' | 'completed'
  theory_read_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  xp_earned: number
  completed_at: string | null
}

export function useLessonProgress(slug: string) {
  const [progress, setProgress] = useState<LessonProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${slug}/progress`)
      if (!res.ok) throw new Error('Failed to fetch progress')
      const data = await res.json()
      setProgress(data)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Error fetching progress'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProgress()
  }, [fetchProgress])

  const markInProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/lessons/${slug}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      if (!res.ok) throw new Error('Failed to update status to in_progress')
      const data = await res.json()
      setProgress((prev) => (prev ? { ...prev, status: data.status } : data))
    } catch (err) {
      console.error('[use-lesson-progress] markInProgress error:', err)
    }
  }, [slug])

  const recordTheoryRead = useCallback(async (activeSeconds: number, scrollPercentage: number) => {
    try {
      const res = await fetch(`/api/lessons/${slug}/theory-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_seconds: activeSeconds, scroll_percentage: scrollPercentage }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to record theory read')
      }
      await fetchProgress()
      return data
    } catch (err) {
      console.error('[use-lesson-progress] recordTheoryRead error:', err)
      throw err;
    }
  }, [slug, fetchProgress])

  const recordQuizAttempt = useCallback(async (attempts: { question_id: string; selected_option: number; is_correct: boolean }[]) => {
    try {
      const res = await fetch(`/api/lessons/${slug}/quiz`, {
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
    } catch (err) {
      console.error('[use-lesson-progress] recordQuizAttempt error:', err)
      throw err;
    }
  }, [slug, fetchProgress])

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
