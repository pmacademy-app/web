'use client'

import { useCallback } from 'react'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPatch, apiPost } from '@/lib/api/client'

export interface LessonProgressV2 {
  status: 'not_started' | 'in_progress' | 'completed'
  theory_read_at: string | null
  quiz_score: number | null
  quiz_attempts: number
  xp_earned: number
  completed_at: string | null
}

export interface QuizAttemptApiResponse {
  success: boolean
  isCompleted?: boolean
  isFirstLesson?: boolean
  totalCompletedLessons?: number
  correctCount?: number
  totalQuestions?: number
  scorePercentage?: number
  score: number
  xpEarned: number
  isPerfect?: boolean
  isFirstAttempt?: boolean
}

/**
 * Hook for managing lesson progress state in the v2 /academy/** route.
 *
 * Backed by SWR and the typed API client foundation (B10-C).
 * Uses stable les_XXXXXX lesson IDs and calls /api/v2/lessons/[lessonId]/*
 * endpoints with optimistic updates and automatic cache deduplication.
 */
export function useLessonProgressV2(lessonId: string, initialProgress?: LessonProgressV2 | null) {
  const endpoint = `/api/v2/lessons/${lessonId}/progress`

  const { data, error, isLoading, mutate } = useApiQuery<LessonProgressV2>(
    lessonId ? endpoint : null,
    {
      fallbackData: initialProgress ?? undefined,
      revalidateOnFocus: true,
    }
  )

  const progress = data ?? initialProgress ?? null
  const loading = isLoading && !progress

  const markInProgress = useCallback(async () => {
    try {
      await mutate(
        async () => {
          const res = await apiPatch<LessonProgressV2>(endpoint, { status: 'in_progress' })
          if (!res.ok) throw new Error(res.error.message)
          return res.data
        },
        {
          optimisticData: (current) => (current ? { ...current, status: 'in_progress' } : current!),
          rollbackOnError: true,
          revalidate: true,
        }
      )
    } catch (err) {
      console.error('[use-lesson-progress-v2] markInProgress error:', err)
    }
  }, [endpoint, mutate])

  const recordTheoryRead = useCallback(
    async (activeSeconds?: number, scrollPercentage?: number) => {
      const nowIso = new Date().toISOString()
      const res = await apiPost<{ xpEarned?: number }>(`/api/v2/lessons/${lessonId}/theory-read`, {
        active_seconds: activeSeconds,
        scroll_percentage: scrollPercentage,
      })
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      void mutate(
        (prev) => (prev ? { ...prev, theory_read_at: nowIso } : prev),
        { revalidate: true }
      )
      return res.data
    },
    [lessonId, mutate]
  )

  const recordQuizAttempt = useCallback(
    async (
      attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
    ): Promise<QuizAttemptApiResponse> => {
      const nowIso = new Date().toISOString()
      const res = await apiPost<QuizAttemptApiResponse>(
        `/api/v2/lessons/${lessonId}/quiz`,
        { attempts }
      )
      if (!res.ok) {
        throw new Error(res.error.message)
      }
      const raw = res.data
      const data: QuizAttemptApiResponse = {
        ...raw,
        score: raw.score ?? raw.scorePercentage ?? 0,
        xpEarned: raw.xpEarned ?? 0,
      }
      void mutate(
        (prev) =>
          prev
            ? {
                ...prev,
                status: 'completed',
                quiz_score:
                  typeof data.scorePercentage === 'number' ? data.scorePercentage : prev.quiz_score,
                xp_earned: (prev.xp_earned || 0) + (data.xpEarned || 0),
                completed_at: prev.completed_at || nowIso,
              }
            : prev,
        { revalidate: true }
      )
      return data
    },
    [lessonId, mutate]
  )

  return {
    progress,
    loading,
    error: error?.message ?? null,
    refetch: () => mutate(),
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
  }
}
