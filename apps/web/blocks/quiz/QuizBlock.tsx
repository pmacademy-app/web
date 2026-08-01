'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, ArrowRight, RotateCcw, Zap, CheckCircle2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QuizOption from '@/components/quiz/QuizOption';
import { BlockProps } from '../../renderer/registry';
import { useLessonContextSafe } from '@/contexts/lesson-context';

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty?: 'easy' | 'medium' | 'medium-hard' | 'hard';
  objectivesTested?: number[];
}

export default function QuizBlock({ block }: BlockProps) {
  const questions: QuizQuestion[] = block.questions || [];
  const totalQuestions = questions.length;
  const lessonCtx = useLessonContextSafe();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  // Ref mirrors attempts state for reliable access in async callbacks
  const attemptsRef = React.useRef<{ question_id: string; selected_option: number; is_correct: boolean }[]>([]);

  const [quizFinished, setQuizFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentQuestion = questions[currentIndex];

  const handleReset = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsConfirmed(false);
    setCorrectCount(0);
    attemptsRef.current = [];
    setQuizFinished(false);
    setSubmitting(false);
  };

  const handleOptionClick = (idx: number) => {
    if (isConfirmed) return;
    setSelectedOption(idx);
  };

  const handleConfirm = useCallback(() => {
    if (selectedOption === null || isConfirmed || !currentQuestion) return;

    const isCorrect = selectedOption === currentQuestion.correctAnswer;
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    }

    const newAttempt = {
      question_id: currentQuestion.id,
      selected_option: selectedOption,
      is_correct: isCorrect,
    };

    attemptsRef.current = [...attemptsRef.current, newAttempt];

    setIsConfirmed(true);
  }, [selectedOption, isConfirmed, currentQuestion]);

  const handleNext = useCallback(() => {
    if (!isConfirmed) return;

    if (currentIndex + 1 < totalQuestions) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsConfirmed(false);
    } else {
      setQuizFinished(true);
      // Submit all attempts via lesson context (v2 route) if available.
      // Use attemptsRef which has already been updated synchronously.
      if (lessonCtx && attemptsRef.current.length > 0) {
        setSubmitting(true);
        lessonCtx
          .onQuizComplete(attemptsRef.current)
          .catch((err) => console.error('[QuizBlock] Failed to submit quiz:', err))
          .finally(() => setSubmitting(false));
      }
    }
  }, [isConfirmed, currentIndex, totalQuestions, lessonCtx]);

  // Keyboard navigation & accessibility keys
  useEffect(() => {
    if (quizFinished || !currentQuestion) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      // Hotkeys: '1', '2', '3', '4' for options
      if (!isConfirmed && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < currentQuestion.options.length) {
          setSelectedOption(idx);
        }
      }

      // Hotkey: Arrow keys for selection
      if (!isConfirmed) {
        if (e.key === 'ArrowDown') {
          setSelectedOption((prev) =>
            prev === null ? 0 : Math.min(currentQuestion.options.length - 1, prev + 1)
          );
        } else if (e.key === 'ArrowUp') {
          setSelectedOption((prev) =>
            prev === null ? 0 : Math.max(0, prev - 1)
          );
        }
      }

      // Hotkey: Space / Enter to confirm or advance
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (selectedOption !== null && !isConfirmed) {
          handleConfirm();
        } else if (isConfirmed) {
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isConfirmed, selectedOption, currentQuestion, handleConfirm, handleNext, quizFinished]);

  if (totalQuestions === 0) {
    return (
      <div className="border border-border p-6 rounded-xl bg-card text-center text-sm text-muted-foreground my-6">
        No quiz questions available for this lesson.
      </div>
    );
  }

  // Summary screen
  if (quizFinished) {
    const percentage = Math.round((correctCount / totalQuestions) * 100);
    const isPerfect = correctCount === totalQuestions;
    const baseXP = correctCount * 5;
    const bonusXP = isPerfect ? 25 : 0;
    const totalXP = baseXP + bonusXP;

    return (
      <div className="max-w-xl mx-auto text-center py-8 space-y-8 animate-fade-in my-6">
        <div className="flex justify-center">
          {isPerfect ? (
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-amber-500 blur opacity-40 animate-pulse" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Trophy className="h-10 w-10 animate-bounce" />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary border border-primary/20">
              <CheckCircle2 className="h-10 w-10 text-primary" />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl md:text-3xl font-bold font-serif text-foreground">
            {isPerfect ? 'Flawless Victory!' : 'Quiz Completed!'}
          </h2>
          <p className="text-muted-foreground text-sm">
            You scored <span className="font-bold text-foreground">{correctCount}</span> out of{' '}
            <span className="font-semibold">{totalQuestions}</span> correct answers ({percentage}%).
          </p>
        </div>

        {/* XP Earning breakdown card */}
        <div className="rounded-xl border border-border bg-card p-6 max-w-sm mx-auto shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">XP Breakdown</h3>
          <div className="space-y-2.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Correct Answers ({correctCount})</span>
              <span className="font-semibold text-foreground">+{baseXP} XP</span>
            </div>

            {isPerfect && (
              <div className="flex justify-between items-center text-sm text-amber-600 dark:text-amber-400 font-semibold border-t border-border pt-2">
                <span className="flex items-center gap-1">
                  <Zap className="h-4 w-4 shrink-0 fill-current" />
                  First-Attempt Perfect Bonus
                </span>
                <span>+25 XP</span>
              </div>
            )}

            <div className="flex justify-between items-center border-t border-border pt-2 text-base font-bold text-foreground">
              <span>Total XP Gained</span>
              <span className="text-primary font-serif">+{totalXP} XP</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Button onClick={handleReset} variant="outline" size="lg" className="w-full sm:w-auto font-medium">
            <RotateCcw className="h-4 w-4 mr-2" />
            Retry Quiz
          </Button>
        </div>
      </div>
    );
  }

  const optionLetters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in my-6" role="group" aria-label="Lesson Quiz">
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

      {/* Question Card */}
      <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
        <div className="text-base md:text-lg font-bold text-foreground font-serif leading-relaxed">
          {currentQuestion.question}
        </div>

        {/* Options grid */}
        <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Answer Options">
          {currentQuestion.options.map((option, idx) => {
            const letter = optionLetters[idx] || 'A';
            let optionState: 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled' = 'default';

            if (isConfirmed) {
              if (idx === currentQuestion.correctAnswer) {
                optionState = 'correct';
              } else if (idx === selectedOption) {
                optionState = 'incorrect';
              } else {
                optionState = 'disabled';
              }
            } else if (idx === selectedOption) {
              optionState = 'selected';
            }

            return (
              <QuizOption
                key={idx}
                letter={letter}
                text={option}
                state={optionState}
                disabled={isConfirmed}
                onClick={() => handleOptionClick(idx)}
              />
            );
          })}
        </div>

        {/* Action Button & Explanation */}
        <div className="pt-4 border-t border-border flex flex-col gap-4">
          <div className="flex justify-end">
            {!isConfirmed ? (
              <Button
                disabled={selectedOption === null}
                onClick={handleConfirm}
                size="lg"
                className="w-full sm:w-auto font-bold px-8"
              >
                Confirm Answer
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={submitting} size="lg" className="w-full sm:w-auto font-bold px-8">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    {currentIndex + 1 < totalQuestions ? 'Next Question' : 'Finish Quiz'}
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Explanation panel */}
          {isConfirmed && currentQuestion.explanation && (
            <div className="p-5 rounded-xl border border-border bg-muted/30 space-y-2 animate-slide-down">
              <div className="flex items-center gap-2 text-sm font-bold">
                {selectedOption === currentQuestion.correctAnswer ? (
                  <>
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">Correct!</span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-white">
                      <X className="h-3 w-3" />
                    </span>
                    <span className="text-destructive">Incorrect</span>
                  </>
                )}
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed font-sans">
                {currentQuestion.explanation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
