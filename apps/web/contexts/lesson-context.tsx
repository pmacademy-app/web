'use client'

/**
 * Lesson Context — provides lesson-scoped callbacks to block components.
 *
 * Block components are rendered via the generic BlockTreeRenderer which only
 * passes `block` and `lessonId` props. For blocks that need to trigger
 * side effects (quiz submission, flashcard SRS recording), they read from
 * this context instead of receiving props directly.
 *
 * Usage:
 *   <LessonContextProvider lessonId={id} onQuizComplete={handler}>
 *     <BlockTreeRenderer blocks={blocks} lessonId={id} />
 *   </LessonContextProvider>
 */

import React, { createContext, useContext } from 'react'

export interface QuizAttempt {
  question_id: string
  selected_option: number
  is_correct: boolean
}

export interface LessonContextValue {
  lessonId: string
  onQuizComplete: (attempts: QuizAttempt[]) => Promise<unknown>
  onFlashcardsComplete?: () => void
  onReflectionComplete?: () => void
  onAdvanceTab?: (tab: 'theory' | 'quiz' | 'flashcards' | 'reflection') => void
}

const LessonContext = createContext<LessonContextValue | null>(null)

export function LessonContextProvider({
  children,
  lessonId,
  onQuizComplete,
  onFlashcardsComplete,
  onReflectionComplete,
  onAdvanceTab,
}: {
  children: React.ReactNode
  lessonId: string
  onQuizComplete: (attempts: QuizAttempt[]) => Promise<unknown>
  onFlashcardsComplete?: () => void
  onReflectionComplete?: () => void
  onAdvanceTab?: (tab: 'theory' | 'quiz' | 'flashcards' | 'reflection') => void
}) {
  return (
    <LessonContext.Provider
      value={{ lessonId, onQuizComplete, onFlashcardsComplete, onReflectionComplete, onAdvanceTab }}
    >
      {children}
    </LessonContext.Provider>
  )
}

export function useLessonContext(): LessonContextValue {
  const ctx = useContext(LessonContext)
  if (!ctx) {
    throw new Error('useLessonContext must be used within a LessonContextProvider')
  }
  return ctx
}

/**
 * Safe version — returns null if not inside a provider.
 * Use this in blocks that are also rendered in standalone contexts (e.g. previews).
 */
export function useLessonContextSafe(): LessonContextValue | null {
  return useContext(LessonContext)
}
