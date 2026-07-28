'use client'

import React, { useState, useEffect, useCallback } from 'react'
import type { QuizQuestion } from '@/types'
import QuizOption from './QuizOption'
import QuizSummary from './QuizSummary'
import { Button } from '@/components/ui/button'
import { Check, X, ArrowRight, Loader2 } from 'lucide-react'

interface QuizContainerProps {
  questions: QuizQuestion[]
  onSubmitQuiz: (
    attempts: { question_id: string; selected_option: number; is_correct: boolean }[]
  ) => Promise<{
    xpEarned: number
    isPerfect: boolean
    isFirstAttempt: boolean
  }>
  onProceedToFlashcards: () => void
}

export default function QuizContainer({
  questions,
  onSubmitQuiz,
  onProceedToFlashcards,
}: QuizContainerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<number | null>(null)
  const [isConfirmed, setIsConfirmed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [attempts, setAttempts] = useState<
    { question_id: string; selected_option: number; is_correct: boolean }[]
  >([])

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [quizResult, setQuizResult] = useState<{
    xpEarned: number
    isPerfect: boolean
    isFirstAttempt: boolean
  } | null>(null)

  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length

  // Reset quiz state
  const handleReset = () => {
    setCurrentIndex(0)
    setSelectedOption(null)
    setIsConfirmed(false)
    setCorrectCount(0)
    setAttempts([])
    setQuizResult(null)
    setIsSubmitting(false)
  }

  // Handle Option Click
  const handleOptionClick = (idx: number) => {
    if (isConfirmed) return
    setSelectedOption(idx)
  };

  // Confirm Option Selection
  const handleConfirm = useCallback(() => {
    if (selectedOption === null || isConfirmed) return

    const isCorrect = selectedOption === currentQuestion.correctOptionIndex
    if (isCorrect) {
      setCorrectCount((c) => c + 1)
    }

    setAttempts((prev) => [
      ...prev,
      {
        question_id: currentQuestion.id,
        selected_option: selectedOption,
        is_correct: isCorrect,
      },
    ])

    setIsConfirmed(true)
  }, [selectedOption, isConfirmed, currentQuestion])

  // Move to next question or submit quiz
  const handleNext = useCallback(async () => {
    if (!isConfirmed) return

    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1)
      setSelectedOption(null)
      setIsConfirmed(false)
    } else {
      // Final question answered, submit attempts
      setIsSubmitting(true)
      try {
        const result = await onSubmitQuiz(attempts)
        setQuizResult(result)
      } catch (err) {
        console.error('[quiz-container] Submission error:', err)
      } finally {
        setIsSubmitting(false)
      }
    }
  }, [isConfirmed, currentIndex, totalQuestions, attempts, onSubmitQuiz])

  // Keyboard navigation & accessibility keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable key bindings if in text input or modals
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return
      }

      // Hotkeys: '1', '2', '3', '4' for A, B, C, D
      if (!isConfirmed && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1
        if (idx < currentQuestion.options.length) {
          setSelectedOption(idx)
        }
      }

      // Hotkey: Arrow keys for selection
      if (!isConfirmed) {
        if (e.key === 'ArrowDown') {
          setSelectedOption((prev) =>
            prev === null ? 0 : Math.min(currentQuestion.options.length - 1, prev + 1)
          )
        } else if (e.key === 'ArrowUp') {
          setSelectedOption((prev) =>
            prev === null ? 0 : Math.max(0, prev - 1)
          )
        }
      }

      // Hotkey: Space / Enter to confirm or advance
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault() // prevent page scrolls on space bar
        if (selectedOption !== null && !isConfirmed) {
          handleConfirm()
        } else if (isConfirmed) {
          handleNext()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isConfirmed, selectedOption, currentQuestion, handleConfirm, handleNext])

  // Render score summary if finished
  if (quizResult) {
    return (
      <QuizSummary
        correctCount={correctCount}
        totalQuestions={totalQuestions}
        xpEarned={quizResult.xpEarned}
        isPerfect={quizResult.isPerfect}
        isFirstAttempt={quizResult.isFirstAttempt}
        onReset={handleReset}
        onProceed={onProceedToFlashcards}
      />
    )
  }

  // Loading state
  if (isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Recording quiz results...</p>
      </div>
    )
  }

  // Question Letters list
  const optionLetters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D']

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in" role="group" aria-label="Lesson Quiz">
      {/* Progress & Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Practice Quiz
          </span>
          <h2 className="text-sm font-semibold text-muted-foreground mt-0.5">
            Question {currentIndex + 1} of {totalQuestions}
          </h2>
        </div>
        <div className="text-xs font-bold text-muted-foreground px-3 py-1 rounded bg-muted border border-border">
          Score: {correctCount} / {totalQuestions}
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Question Text */}
      <div className="py-2">
        <h3 className="text-lg md:text-xl font-bold text-foreground leading-relaxed">
          {currentQuestion.questionText}
        </h3>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Quiz answers">
        {currentQuestion.options.map((opt, i) => {
          let state: 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled' = 'default'

          if (isConfirmed) {
            if (i === currentQuestion.correctOptionIndex) {
              state = 'correct'
            } else if (i === selectedOption) {
              state = 'incorrect'
            } else {
              state = 'disabled'
            }
          } else {
            if (i === selectedOption) {
              state = 'selected'
            }
          }

          return (
            <QuizOption
              key={i}
              letter={optionLetters[i]}
              text={opt}
              state={state}
              onClick={() => handleOptionClick(i)}
              disabled={isConfirmed}
            />
          )
        })}
      </div>

      {/* Confirmed Explanation Alert */}
      {isConfirmed && (
        <div
          className={`p-6 rounded-xl border space-y-3 animate-fade-in ${
            selectedOption === currentQuestion.correctOptionIndex
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-destructive/20 bg-destructive/5'
          }`}
        >
          <div className="flex items-center gap-2">
            {selectedOption === currentQuestion.correctOptionIndex ? (
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                <Check className="h-5 w-5" />
                <span>Correct!</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-destructive font-bold text-sm">
                <X className="h-5 w-5" />
                <span>Incorrect</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground font-medium">
              • Correct Answer is {optionLetters[currentQuestion.correctOptionIndex]}
            </span>
          </div>

          <p className="text-sm text-foreground/80 leading-relaxed">
            {currentQuestion.explanation}
          </p>

          {currentQuestion.learningObjective && (
            <div className="text-xs text-muted-foreground/60 border-t border-border/40 pt-2 mt-2">
              Learning Objective: {currentQuestion.learningObjective}
            </div>
          )}
        </div>
      )}

      {/* Button Controls */}
      <div className="flex justify-end pt-4">
        {!isConfirmed ? (
          <Button
            onClick={handleConfirm}
            disabled={selectedOption === null}
            size="lg"
            className="w-full sm:w-auto font-medium"
          >
            Confirm Answer
          </Button>
        ) : (
          <Button onClick={handleNext} size="lg" className="w-full sm:w-auto font-medium">
            {currentIndex + 1 < totalQuestions ? (
              <>
                Next Question
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            ) : (
              'Finish Quiz & Record Score'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
