'use client'

import React, { useState, useEffect } from 'react'
import type { ParsedLesson } from '@/types'
import { useLessonProgress } from '@/hooks/use-lesson-progress'
import LessonHeader from './LessonHeader'
import TheorySection from './TheorySection'
import QuizContainer from '../quiz/QuizContainer'
import FlashcardDeck from '../flashcard/FlashcardDeck'
import ReflectionForm from '../forms/ReflectionForm'
import { Lock, BookOpen, CheckSquare, Layers, Edit3, ArrowLeft, Loader2, Award } from 'lucide-react'
import Link from 'next/link'

interface LessonViewShellProps {
  lesson: ParsedLesson
}

type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

export default function LessonViewShell({ lesson }: LessonViewShellProps) {
  const { slug } = lesson.meta
  const {
    progress,
    loading,
    error,
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
  } = useLessonProgress(slug)

  const [activeTab, setActiveTab] = useState<TabType>('theory')
  const [completedThisSession, setCompletedThisSession] = useState(false)

  // 1. Mark lesson in progress upon open
  useEffect(() => {
    if (progress && progress.status === 'not_started') {
      markInProgress()
    }
  }, [progress, markInProgress])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-semibold">Loading lesson progress...</p>
      </div>
    )
  }

  if (error || !progress) {
    return (
      <div className="text-center py-20 space-y-4">
        <p className="text-red-500 font-bold">Failed to load lesson progress. Please reload.</p>
        <Link href="/dashboard" className="text-primary hover:underline text-sm font-semibold">
          Return to Dashboard
        </Link>
      </div>
    )
  }

  // 2. Compute tab locks
  const isTheoryUnlocked = true
  const isQuizUnlocked = !!progress.theory_read_at
  const isFlashcardsUnlocked = progress.status === 'completed'
  const isReflectionUnlocked = progress.status === 'completed'

  const handleTheoryComplete = async (seconds: number, scroll: number) => {
    await recordTheoryRead(seconds, scroll)
  }

  const handleQuizComplete = async (
    attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
  ) => {
    return await recordQuizAttempt(attempts)
  }

  const handleReflectionComplete = () => {
    setCompletedThisSession(true)
  }

  // Render Lesson Mastered screen
  if (completedThisSession) {
    const nextLessonNumber = lesson.meta.number + 1
    const nextModuleNumber = Math.ceil(nextLessonNumber / 10)
    const nextLessonSlug = `lesson-${String(nextLessonNumber).padStart(3, '0')}`

    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-8 animate-scale-up">
        <div className="flex justify-center">
          <div className="relative">
            <div className="absolute -inset-1 rounded-full bg-primary blur opacity-35 animate-pulse" />
            <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-primary text-white shadow-xl">
              <Award className="h-12 w-12" />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-serif text-foreground">Lesson Completed!</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Congratulations! You have completed Lesson {lesson.meta.number}: {lesson.meta.title}. Your skill radar has been updated.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {nextLessonNumber <= 90 ? (
            <Link
              href={`/curriculum/module-${nextModuleNumber}/${nextLessonSlug}`}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Continue to Lesson {nextLessonNumber} →
            </Link>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 text-sm font-bold">
              👑 You have completed all 90 lessons!
            </div>
          )}
          <Link
            href="/curriculum"
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            Back to Curriculum
          </Link>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'theory', label: 'Theory', icon: BookOpen, unlocked: isTheoryUnlocked },
    { id: 'quiz', label: 'Practice Quiz', icon: CheckSquare, unlocked: isQuizUnlocked },
    { id: 'flashcards', label: 'Flashcards', icon: Layers, unlocked: isFlashcardsUnlocked },
    { id: 'reflection', label: 'Reflection', icon: Edit3, unlocked: isReflectionUnlocked },
  ] as const

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Navigation & Tab Headers */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
        <Link
          href={`/curriculum`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Module</span>
        </Link>

        {/* Tab row navigation */}
        <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lesson Sections">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                disabled={!tab.unlocked}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : tab.unlocked
                    ? 'bg-card border border-border text-foreground hover:bg-accent/40'
                    : 'bg-muted/40 border border-muted text-muted-foreground cursor-not-allowed opacity-55'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
                {!tab.unlocked && <Lock className="h-3 w-3 shrink-0" />}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Lesson Metadata Header */}
      {activeTab === 'theory' && (
        <LessonHeader
          moduleNumber={lesson.meta.moduleNumber}
          moduleName={lesson.meta.moduleName}
          lessonNumber={lesson.meta.number}
          lessonTitle={lesson.meta.title}
          difficulty={lesson.meta.difficulty}
          estMinutesReading={lesson.meta.estMinutesReading}
        />
      )}

      {/* Tab Panels */}
      <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm">
        {activeTab === 'theory' && (
          <TheorySection
            lesson={lesson}
            theoryReadAt={progress.theory_read_at}
            onCompleteReading={handleTheoryComplete}
            onProceedToQuiz={() => setActiveTab('quiz')}
          />
        )}

        {activeTab === 'quiz' && (
          <QuizContainer
            questions={lesson.quiz}
            onSubmitQuiz={handleQuizComplete}
            onProceedToFlashcards={() => setActiveTab('flashcards')}
          />
        )}

        {activeTab === 'flashcards' && (
          <FlashcardDeck
            cards={lesson.flashcards}
            onProceedToReflection={() => setActiveTab('reflection')}
          />
        )}

        {activeTab === 'reflection' && (
          <ReflectionForm
            lessonSlug={slug}
            prompt={lesson.reflectionPrompt}
            onComplete={handleReflectionComplete}
          />
        )}
      </div>
    </div>
  )
}
