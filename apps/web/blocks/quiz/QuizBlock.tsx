'use client';

import React, { useState, useCallback, useRef, useEffect, useId } from 'react';
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

// Elements that already act on Enter / Space themselves.
const NATIVE_ACTIVATION_SELECTOR =
  'button, a, input, textarea, select, [contenteditable="true"], [contenteditable=""]';

// Where focus should land after the next render. Confirming disables the
// option buttons, advancing disables the action button until a new option is
// picked, and finishing or retrying swaps the whole view, so in each case focus
// is moved on purpose instead of dropping to the page body.
type PendingFocus = 'action' | 'question' | 'summary' | null;

function focusIsInside(root: HTMLElement | null): boolean {
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  return Boolean(root && active && root.contains(active));
}

function isTextEntryTarget(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export default function QuizBlock({ block }: BlockProps) {
  const totalQuestions = (block.questions || []).length;
  const lessonCtx = useLessonContextSafe();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  // Ref mirrors attempts state for reliable access in async callbacks
  const attemptsRef = useRef<{ question_id: string; selected_option: number; is_correct: boolean }[]>([]);

  const [quizFinished, setQuizFinished] = useState(false);
  const quizRootRef = useRef<HTMLDivElement>(null);
  const questionTextRef = useRef<HTMLDivElement>(null);
  const actionRowRef = useRef<HTMLDivElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocusRef = useRef<PendingFocus>(null);
  const summaryScoreId = useId();
  const [submitting, setSubmitting] = useState(false);

  const [shuffledQuestions] = useState<(QuizQuestion & { shuffledOptions: { text: string; originalIndex: number }[] })[]>(() => {
    const questions = block.questions || [];
    return questions.map(q => {
      const optionsWithOriginalIndices = q.options.map((text, idx) => ({ text, originalIndex: idx }));
      // Fisher-Yates shuffle
      for (let i = optionsWithOriginalIndices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsWithOriginalIndices[i], optionsWithOriginalIndices[j]] = [optionsWithOriginalIndices[j], optionsWithOriginalIndices[i]];
      }
      return {
        ...q,
        shuffledOptions: optionsWithOriginalIndices
      };
    });
  });

  const currentQuestion = shuffledQuestions[currentIndex];

  const handleReset = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setIsConfirmed(false);
    setCorrectCount(0);
    attemptsRef.current = [];
    pendingFocusRef.current = 'question';
    setQuizFinished(false);
    setSubmitting(false);
  };

  const handleOptionClick = (idx: number) => {
    if (isConfirmed) return;
    setSelectedOption(idx);
  };

  const handleConfirm = useCallback(() => {
    if (selectedOption === null || isConfirmed || !currentQuestion) return;

    const chosenOriginalIndex = currentQuestion.shuffledOptions[selectedOption].originalIndex;
    const isCorrect = chosenOriginalIndex === currentQuestion.correctAnswer;
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    }

    const newAttempt = {
      question_id: currentQuestion.id,
      selected_option: chosenOriginalIndex,
      is_correct: isCorrect,
    };

    attemptsRef.current = [...attemptsRef.current, newAttempt];

    // The focused option is about to be disabled; hand focus to the action
    // button (now "Next Question" / "Finish Quiz") so Enter keeps working.
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (active && active.getAttribute('role') === 'radio' && quizRootRef.current?.contains(active)) {
      pendingFocusRef.current = 'action';
    }
    setIsConfirmed(true);
  }, [selectedOption, isConfirmed, currentQuestion]);

  const handleNext = useCallback(() => {
    if (!isConfirmed) return;

    if (currentIndex + 1 < totalQuestions) {
      if (focusIsInside(quizRootRef.current)) pendingFocusRef.current = 'question';
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsConfirmed(false);
    } else {
      pendingFocusRef.current = 'summary';
      setQuizFinished(true);
      // Submit all attempts via lesson context (v2 route) if available.
      // Use attemptsRef which has already been updated synchronously.
      if (lessonCtx?.onQuizComplete && attemptsRef.current.length > 0) {
        setSubmitting(true);
        lessonCtx
          .onQuizComplete(attemptsRef.current)
          .catch((err) => console.error('[QuizBlock] Failed to submit quiz:', err))
          .finally(() => setSubmitting(false));
      }
    }
  }, [isConfirmed, currentIndex, totalQuestions, lessonCtx]);

  // Apply any focus move requested by the handlers above once the new view is
  // in the DOM.
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    if (pending === 'summary') {
      summaryHeadingRef.current?.focus();
    } else if (pending === 'question') {
      questionTextRef.current?.focus({ preventScroll: true });
    } else {
      const actionButton = actionRowRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
      actionButton?.focus({ preventScroll: true });
    }
  });

  // Keyboard shortcuts are scoped to the quiz: the handler sits on the quiz
  // container (onKeyDown below), so keys pressed elsewhere on the page are
  // never captured. Digits and arrows pick an option; Enter / Space confirm or
  // advance, unless the key landed on a control that already acts on it.
  const handleQuizKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (quizFinished || !currentQuestion) return;

    // Leave browser and OS shortcuts (Ctrl+1, Alt+Arrow and so on) alone.
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const target = e.target instanceof Element ? e.target : null;
    if (target && isTextEntryTarget(target)) return;

    const optionCount = currentQuestion.shuffledOptions.length;
    const focusedOptionIndex = optionRefs.current.findIndex((el) => el !== null && el === target);

    // Radiogroup pattern: picking an option by key also moves focus to it, so
    // the focused option and the selected option never disagree.
    const selectAndFocus = (idx: number) => {
      setSelectedOption(idx);
      optionRefs.current[idx]?.focus({ preventScroll: true });
    };

    // Hotkeys: '1', '2', '3', '4' for options
    if (!isConfirmed && ['1', '2', '3', '4'].includes(e.key)) {
      const idx = parseInt(e.key, 10) - 1;
      if (idx < optionCount) {
        e.preventDefault();
        selectAndFocus(idx);
      }
      return;
    }

    // Hotkey: Arrow keys move through the options
    const isNextKey = e.key === 'ArrowDown' || e.key === 'ArrowRight';
    const isPrevKey = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    if (!isConfirmed && (isNextKey || isPrevKey)) {
      e.preventDefault();
      const from = focusedOptionIndex >= 0 ? focusedOptionIndex : selectedOption;
      const idx =
        from === null
          ? 0
          : isNextKey
            ? Math.min(optionCount - 1, from + 1)
            : Math.max(0, from - 1);
      selectAndFocus(idx);
      return;
    }

    if (e.key !== 'Enter' && e.key !== ' ') return;
    // A held key would otherwise confirm and then skip straight past the result.
    if (e.repeat) {
      e.preventDefault();
      return;
    }

    // Enter on a focused option confirms it once it is the selected one, the
    // way Enter submits a form from a radio button. Space keeps its native
    // behaviour of picking the option.
    if (e.key === 'Enter' && focusedOptionIndex >= 0 && !isConfirmed) {
      e.preventDefault();
      if (selectedOption === focusedOptionIndex) {
        handleConfirm();
      } else {
        setSelectedOption(focusedOptionIndex);
      }
      return;
    }

    // Space / Enter elsewhere in the quiz confirm or advance. Any other focused
    // button, link or field handles these keys natively, so acting here as
    // well would fire the action twice.
    const nativeControl = target?.closest(NATIVE_ACTIVATION_SELECTOR);
    if (nativeControl && e.currentTarget.contains(nativeControl)) {
      return;
    }
    e.preventDefault();
    if (selectedOption !== null && !isConfirmed) {
      handleConfirm();
    } else if (isConfirmed) {
      handleNext();
    }
  };

  if (totalQuestions === 0) {
    return (
      <div className="border border-border p-6 rounded-xl bg-card text-center text-sm text-muted-foreground my-6">
        No quiz questions available for this lesson.
      </div>
    );
  }
  if (shuffledQuestions.length === 0) return null; // Wait for shuffle on mount

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
          {/* Focus lands here when the quiz finishes, so keyboard and screen
              reader users hear the result instead of losing their place. */}
          <h2
            ref={summaryHeadingRef}
            tabIndex={-1}
            aria-describedby={summaryScoreId}
            className="text-2xl md:text-3xl font-bold font-serif text-foreground rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {isPerfect ? 'Flawless Victory!' : 'Quiz Completed!'}
          </h2>
          <p id={summaryScoreId} role="status" className="text-muted-foreground text-sm">
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

        {/*
          Phase 3 (3.3): on completion the lesson shell takes over with the "Lesson
          Completed!" screen whose primary CTA is the next lesson. While the attempt is
          being saved we show a progress indicator; flashcards are demoted to a secondary
          fallback (they are also reachable from their own tab now, unlocked after theory).
        */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          {submitting ? (
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving your progress…
            </div>
          ) : (
            <>
              {lessonCtx?.onAdvanceTab && (
                <Button
                  onClick={() => lessonCtx.onAdvanceTab?.('flashcards')}
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto font-medium"
                >
                  Review Flashcards
                </Button>
              )}
              <Button onClick={handleReset} variant="outline" size="lg" className="w-full sm:w-auto font-medium">
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry Quiz
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const optionLetters: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

  let resultAnnouncement = '';
  if (isConfirmed && selectedOption !== null) {
    const answeredCorrectly =
      currentQuestion.shuffledOptions[selectedOption]?.originalIndex === currentQuestion.correctAnswer;
    const correctText = currentQuestion.options[currentQuestion.correctAnswer] ?? '';
    resultAnnouncement = answeredCorrectly
      ? 'Correct'
      : `Incorrect. The correct answer is ${correctText}.`;
  }

  return (
    <div
      ref={quizRootRef}
      className="max-w-3xl mx-auto space-y-6 animate-fade-in my-6 outline-none"
      role="group"
      aria-label="Lesson Quiz"
      tabIndex={-1}
      onKeyDown={handleQuizKeyDown}
    >

      {/* Progress & Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Practice Quiz
          </span>
          <h2 className="text-sm font-semibold text-muted-foreground mt-0.5">
            Question {currentIndex + 1} of {totalQuestions}
          </h2>
          {/* Announces the result of each confirmed answer to screen readers.
              Kept mounted so the change in text is what gets announced. It is
              absolutely positioned (sr-only), so it does not affect layout. */}
          <div role="status" aria-live="polite" className="sr-only">
            {resultAnnouncement}
          </div>
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
        <div
          ref={questionTextRef}
          tabIndex={-1}
          className="text-base md:text-lg font-bold text-foreground font-serif leading-relaxed rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {currentQuestion.question}
        </div>

        {/* Options grid */}
        <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Answer Options">
          {currentQuestion.shuffledOptions.map((optionObj, idx) => {
            const letter = optionLetters[idx] || 'A';
            // Roving tabindex: only the selected option (or the first one when
            // nothing is selected) is in the tab order; arrows reach the rest.
            const isTabStop = selectedOption === null ? idx === 0 : idx === selectedOption;
            let optionState: 'default' | 'selected' | 'correct' | 'incorrect' | 'disabled' = 'default';

            if (isConfirmed) {
              if (optionObj.originalIndex === currentQuestion.correctAnswer) {
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
                text={optionObj.text}
                state={optionState}
                disabled={isConfirmed}
                tabIndex={isTabStop ? 0 : -1}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                onClick={() => handleOptionClick(idx)}
              />
            );
          })}
        </div>

        {/* Action Button & Explanation */}
        <div className="pt-4 border-t border-border flex flex-col gap-4">
          <div ref={actionRowRef} className="flex justify-end">
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
                {currentQuestion.shuffledOptions[selectedOption!]?.originalIndex === currentQuestion.correctAnswer ? (
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
