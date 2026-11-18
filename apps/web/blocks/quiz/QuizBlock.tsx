'use client';

import React, { useState, useCallback, useRef, useEffect, useId } from 'react';
import { Trophy, ArrowRight, RotateCcw, Zap, CheckCircle2, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import QuizOption from '@/components/quiz/QuizOption';
import { BlockProps } from '../../renderer/registry';
import { useLessonContextSafe } from '@/contexts/lesson-context';
import { checkQuizAnswer, createQuizAttemptId, QUIZ_CHECK_OFFLINE_MESSAGE } from './check-answer';

/**
 * A quiz question as the block receives it. On the learner lesson page the answer fields are
 * absent (lib/academy/client-lesson.ts strips them) and each answer is checked by the server
 * after the learner commits it. Where they are present (the admin preview renders the full
 * compiled lesson) the block checks locally, since the answers are already on the page.
 */
interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer?: number;
  explanation?: string;
  difficulty?: string;
  objectivesTested?: number[];
}

/**
 * The result of one confirmed answer. `correct` and `correctAnswer` are null when the server
 * reports the question was already checked in this attempt: the answer is kept and scored at
 * submit, but nothing is revealed.
 */
interface AnswerResult {
  correct: boolean | null;
  correctAnswer: number | null;
  explanation: string;
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

/** Reads the XP figure from the quiz API result without trusting its shape. */
function readServerXp(result: unknown): { xpEarned: number; isFirstAttempt: boolean } | null {
  if (!result || typeof result !== 'object') return null;
  const { xpEarned, isFirstAttempt } = result as { xpEarned?: unknown; isFirstAttempt?: unknown };
  if (typeof xpEarned !== 'number' || !Number.isFinite(xpEarned) || xpEarned < 0) return null;
  return { xpEarned: Math.floor(xpEarned), isFirstAttempt: isFirstAttempt === true };
}

/** Reads the server's score from the quiz API result, which is the authoritative one. */
function readServerScore(result: unknown): { correctCount: number; totalQuestions: number } | null {
  if (!result || typeof result !== 'object') return null;
  const { correctCount, totalQuestions } = result as { correctCount?: unknown; totalQuestions?: unknown };
  if (typeof correctCount !== 'number' || typeof totalQuestions !== 'number') return null;
  if (!Number.isInteger(correctCount) || !Number.isInteger(totalQuestions)) return null;
  if (totalQuestions <= 0 || correctCount < 0 || correctCount > totalQuestions) return null;
  return { correctCount, totalQuestions };
}

export default function QuizBlock({ block, lessonId }: BlockProps) {
  const totalQuestions = (block.questions || []).length;
  const lessonCtx = useLessonContextSafe();
  const checkLessonId = lessonCtx?.lessonId ?? lessonId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const isConfirmed = answerResult !== null;
  // A server check in flight, and the copy to show when one failed (nothing is revealed).
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const answerLocked = isConfirmed || checking;
  // One random id per attempt; the check route allows one check per (attempt, question).
  const attemptIdRef = useRef<string | null>(null);
  // Bumped on every check and on reset, so a late response for an old question is ignored.
  const checkSeqRef = useRef(0);
  const [correctCount, setCorrectCount] = useState(0);
  // Signed receipts from the check route for this attempt, sent with the submit so each
  // checked question is scored as checked.
  const receiptsRef = useRef<string[]>([]);
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
  // XP as reported by the quiz API for this attempt. Null until the server answers (or when it
  // does not report a figure), so the summary never shows a client-side guess.
  const [serverXp, setServerXp] = useState<{ xpEarned: number; isFirstAttempt: boolean } | null>(null);
  // The server's score for the submitted attempt. Preferred over the local tally, which
  // cannot count a question whose result was not revealed.
  const [serverScore, setServerScore] = useState<{ correctCount: number; totalQuestions: number } | null>(null);

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
    checkSeqRef.current += 1;
    attemptIdRef.current = null;
    receiptsRef.current = [];
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswerResult(null);
    setChecking(false);
    setCheckError(null);
    setCorrectCount(0);
    attemptsRef.current = [];
    pendingFocusRef.current = 'question';
    setQuizFinished(false);
    setSubmitting(false);
    setServerXp(null);
    setServerScore(null);
  };

  const handleOptionClick = (idx: number) => {
    if (answerLocked) return;
    setSelectedOption(idx);
    setCheckError(null);
  };

  const handleConfirm = useCallback(() => {
    if (selectedOption === null || isConfirmed || checking || !currentQuestion) return;

    const question = currentQuestion;
    const chosenOriginalIndex = question.shuffledOptions[selectedOption].originalIndex;

    // Records the answer and shows its result. The focused option or Confirm button is
    // about to be disabled or relabelled; hand focus to the action button (now "Next
    // Question" / "Finish Quiz") so Enter keeps working.
    const applyResult = (result: AnswerResult, moveFocus: boolean) => {
      if (result.correct === true) {
        setCorrectCount((c) => c + 1);
      }
      attemptsRef.current = [
        ...attemptsRef.current,
        {
          question_id: question.id,
          selected_option: chosenOriginalIndex,
          // Informational only: the submit route rescores every answer on the server.
          is_correct: result.correct === true,
        },
      ];
      if (moveFocus) pendingFocusRef.current = 'action';
      setCheckError(null);
      setAnswerResult(result);
    };

    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const focusOnOption = Boolean(
      active && active.getAttribute('role') === 'radio' && quizRootRef.current?.contains(active)
    );

    // Answers already on the page (admin preview): check locally.
    if (typeof question.correctAnswer === 'number') {
      applyResult(
        {
          correct: chosenOriginalIndex === question.correctAnswer,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation ?? '',
        },
        focusOnOption
      );
      return;
    }

    // Learner lesson page: the server checks the answer and reveals the result.
    const focusWasInside = focusIsInside(quizRootRef.current);
    if (!attemptIdRef.current) attemptIdRef.current = createQuizAttemptId();
    const seq = ++checkSeqRef.current;
    setChecking(true);
    setCheckError(null);
    checkQuizAnswer({
      lessonId: checkLessonId,
      questionId: question.id,
      answer: chosenOriginalIndex,
      attemptId: attemptIdRef.current,
      optionCount: question.options.length,
    })
      .catch(() => ({ kind: 'error' as const, status: 0, message: QUIZ_CHECK_OFFLINE_MESSAGE }))
      .then((outcome) => {
        if (seq !== checkSeqRef.current) return;
        setChecking(false);
        if (outcome.kind === 'error') {
          setCheckError(outcome.message);
          return;
        }
        const moveFocus = focusWasInside || focusIsInside(quizRootRef.current);
        if (outcome.kind === 'revealed') {
          if (outcome.reveal.receipt) receiptsRef.current = [...receiptsRef.current, outcome.reveal.receipt];
          applyResult(outcome.reveal, moveFocus);
        } else {
          applyResult({ correct: null, correctAnswer: null, explanation: '' }, moveFocus);
        }
      });
  }, [selectedOption, isConfirmed, checking, currentQuestion, checkLessonId]);

  const handleNext = useCallback(() => {
    if (!isConfirmed) return;

    if (currentIndex + 1 < totalQuestions) {
      if (focusIsInside(quizRootRef.current)) pendingFocusRef.current = 'question';
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setAnswerResult(null);
    } else {
      pendingFocusRef.current = 'summary';
      setQuizFinished(true);
      // Submit all attempts via lesson context (v2 route) if available.
      // Use attemptsRef which has already been updated synchronously.
      if (lessonCtx?.onQuizComplete && attemptsRef.current.length > 0) {
        setSubmitting(true);
        setServerXp(null);
        setServerScore(null);
        const attemptId = attemptIdRef.current;
        lessonCtx
          .onQuizComplete(
            attemptsRef.current,
            attemptId ? { attemptId, receipts: receiptsRef.current } : undefined
          )
          .then((result) => {
            setServerXp(readServerXp(result));
            setServerScore(readServerScore(result));
          })
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
    if (!answerLocked && ['1', '2', '3', '4'].includes(e.key)) {
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
    if (!answerLocked && (isNextKey || isPrevKey)) {
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
    if (e.key === 'Enter' && focusedOptionIndex >= 0 && !answerLocked) {
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
    // The server's score once it answers; the local tally until then (or without a server).
    const finalCorrect = serverScore?.correctCount ?? correctCount;
    const finalTotal = serverScore?.totalQuestions ?? totalQuestions;
    const percentage = Math.round((finalCorrect / finalTotal) * 100);
    const isPerfect = finalCorrect === finalTotal;
    const isPassed = percentage >= 70;

    return (
      <div className="max-w-xl mx-auto text-center py-8 space-y-8 animate-fade-in my-6">
        <div className="flex justify-center">
          {isPerfect ? (
            <div className="relative">
              <div className="absolute -inset-1 rounded-full bg-amber-500 blur opacity-40 animate-pulse" />
              <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/10 text-warning border border-amber-500/20">
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
            {isPerfect ? 'Flawless Victory!' : isPassed ? 'Quiz Completed!' : 'Keep Practicing!'}
          </h2>
          <p id={summaryScoreId} role="status" className="text-muted-foreground text-sm">
            {isPassed ? (
              <>
                You scored <span className="font-bold text-foreground">{finalCorrect}</span> out of{' '}
                <span className="font-semibold">{finalTotal}</span> correct answers ({percentage}%).
              </>
            ) : (
              <>
                Attempted, {percentage}%. You scored <span className="font-bold text-foreground">{finalCorrect}</span> out of{' '}
                <span className="font-semibold">{finalTotal}</span> correct answers. Retake to complete (70% required).
              </>
            )}
          </p>
        </div>

        {/* XP card: shows only the figure the quiz API reported for this attempt. */}
        {serverXp && (
          <div className="rounded-xl border border-border bg-card p-6 max-w-sm mx-auto shadow-sm space-y-2">
            <div className="flex justify-between items-center text-base font-bold text-foreground">
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                XP Gained
              </span>
              <span className="text-primary font-serif">+{serverXp.xpEarned} XP</span>
            </div>
            {serverXp.xpEarned === 0 && (
              <p className="text-xs text-muted-foreground text-left">
                No new XP this attempt.
              </p>
            )}
            {serverXp.xpEarned > 0 && isPerfect && serverXp.isFirstAttempt && (
              <p className="text-xs text-muted-foreground text-left">
                Includes the first-attempt perfect score bonus.
              </p>
            )}
          </div>
        )}

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

  const revealedAnswer = answerResult?.correctAnswer ?? null;
  let resultAnnouncement = '';
  if (answerResult && selectedOption !== null) {
    if (answerResult.correct === true) {
      resultAnnouncement = 'Correct';
    } else if (answerResult.correct === false) {
      const correctText = revealedAnswer !== null ? currentQuestion.options[revealedAnswer] ?? '' : '';
      resultAnnouncement = correctText
        ? `Incorrect. The correct answer is ${correctText}.`
        : 'Incorrect.';
    } else {
      resultAnnouncement = 'Answer saved. Your score will show at the end.';
    }
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

            if (isConfirmed && revealedAnswer !== null) {
              if (optionObj.originalIndex === revealedAnswer) {
                optionState = 'correct';
              } else if (idx === selectedOption) {
                optionState = 'incorrect';
              } else {
                optionState = 'disabled';
              }
            } else if (isConfirmed) {
              // Already checked in this attempt: keep the pick visible, reveal nothing.
              optionState = idx === selectedOption ? 'selected' : 'disabled';
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
          {/* A failed check reveals nothing; the learner can try again. */}
          {checkError && !isConfirmed && (
            <p role="alert" className="text-sm text-destructive">
              {checkError}
            </p>
          )}
          <div ref={actionRowRef} className="flex justify-end">
            {!isConfirmed ? (
              <Button
                disabled={selectedOption === null || checking}
                aria-busy={checking || undefined}
                onClick={handleConfirm}
                size="lg"
                className="w-full sm:w-auto font-bold px-8"
              >
                {checking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : checkError ? (
                  <>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Try Again
                  </>
                ) : (
                  'Confirm Answer'
                )}
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
          {answerResult && answerResult.correct === null && (
            <div className="p-5 rounded-xl border border-border bg-muted/30 space-y-2 animate-slide-down">
              <p className="text-sm font-bold text-foreground">Answer saved</p>
              <p className="text-sm text-foreground/80 leading-relaxed font-sans">
                This question was already checked in this attempt. Your answer counts toward the score at the end.
              </p>
            </div>
          )}
          {answerResult && answerResult.correct !== null && answerResult.explanation && (
            <div className="p-5 rounded-xl border border-border bg-muted/30 space-y-2 animate-slide-down">
              <div className="flex items-center gap-2 text-sm font-bold">
                {answerResult.correct ? (
                  <>
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                    <span className="text-success">Correct!</span>
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
                {answerResult.explanation}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
