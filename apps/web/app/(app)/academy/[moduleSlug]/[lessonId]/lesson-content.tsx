'use client'

/**
 * LessonPageContent — v2 interactive lesson shell for the /academy/[moduleSlug]/[lessonId] route.
 *
 * This replaces LessonViewShell (v1) for the new block-tree renderer architecture.
 * It:
 *   - Renders the lesson via <BlockTreeRenderer> instead of hardcoded section components
 *   - Uses useLessonProgressV2 (stable lessonId, /api/v2/* endpoints)
 *   - Tracks theory read engagement, quiz submission, and reflection completion
 *   - Renders a tab-based shell: Theory | Practice Quiz | Flashcards | Reflection
 *
 * Reference: rendering-pipeline.md §2.2
 */

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLessonProgressV2 } from '@/hooks/use-lesson-progress-v2'
import { useApiQuery } from '@/lib/api/hooks'
import { apiPost } from '@/lib/api/client'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'
import { LessonContextProvider } from '@/contexts/lesson-context'
import { dispatchClientNotificationEvent } from '@/lib/events/client-event-bus'
import type { CompiledLesson, CompiledBlock } from '@/types'
import {
  BookOpen,
  CheckSquare,
  Layers,
  Edit3,
  Lock,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Award,
  Trophy,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBreadcrumbs } from '@/contexts/breadcrumb-context'
import {
  trackLessonStarted,
  trackTheoryRead,
  trackQuizCompleted,
  trackLessonCompleted,
  trackFirstLessonCompleted,
  trackRecutExperimentExposed,
  trackCoreViewed,
  trackQuizStarted,
  trackDeepDiveOpened,
} from '@/lib/analytics'
import { FirstSessionCelebrationModal } from '@/components/celebration/FirstSessionCelebrationModal'
import { LessonFeedbackWidget } from '@/components/feedback/LessonFeedbackWidget'
import { DeepDiveSection } from '@/components/academy/DeepDiveSection'
import {
  getCoreBlocks,
  getDeepDiveBlocks,
  getCoreReadingMinutes,
  getDeepDiveReadingMinutes,
} from '@/lib/academy/lesson-structure'
import type { RecutVariant } from '@/lib/academy/experiment'



// ─── Props ───────────────────────────────────────────────────────────────────

import type { LessonProgressV2 } from '@/hooks/use-lesson-progress-v2'

interface LessonPageContentProps {
  lesson: CompiledLesson
  prevLessonUrl: string | null
  nextLessonUrl: string | null
  nextLessonTitle?: string | null   // title of the next lesson, for the completion CTA
  globalOrder: number       // 1-indexed global curriculum position (1..90)
  moduleNumber: number      // 1-indexed module number (1..9)
  moduleName: string        // formatted module display name
  initialProgress?: LessonProgressV2 | null
  /**
   * Phase 4 A/B variant, resolved server-side (deterministic per user). `treatment` renders
   * the Core / Deep-dive split + sampled quiz; `control` renders the unchanged full lesson.
   * Defaults to `control` so the split is off unless the experiment is enabled.
   */
  recutVariant?: RecutVariant
}

type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

// ─── Helper: extract blocks by type ─────────────────────────────────────────
//
// Phase 4 (§4.1): under the `treatment` variant the theory surface renders only the Core
// blocks; the Deep-dive is rendered separately (and lazily) by <DeepDiveSection>. Under
// `control` the theory surface renders every non-tab block exactly as before, so the
// experiment's control arm is a faithful reproduction of the pre-Phase-4 lesson.

export function getBlocksForTab(
  blocks: CompiledBlock[],
  tab: TabType,
  variant: RecutVariant = 'control'
): CompiledBlock[] {
  if (tab === 'theory') {
    if (variant === 'treatment') {
      return getCoreBlocks(blocks)
    }
    // Control: everything except quiz, flashcardDeck, reflection (legacy behaviour).
    const EXCLUDED = new Set(['quiz', 'flashcardDeck', 'reflection'])
    return blocks.filter((b) => !EXCLUDED.has(b.type))
  }
  if (tab === 'quiz') {
    return blocks.filter((b) => b.type === 'quiz')
  }
  if (tab === 'flashcards') {
    return blocks.filter((b) => b.type === 'flashcardDeck')
  }
  if (tab === 'reflection') {
    return blocks.filter((b) => b.type === 'reflection')
  }
  return []
}

export function isTabUnlocked(tab: TabType, prog: LessonProgressV2 | null | undefined): boolean {
  if (tab === 'theory') return true
  if (!prog) return false
  // Phase 3 (3.6): retrieval practice belongs *before* the quiz, not after "done".
  // Flashcards unlock as soon as theory is read — consistent with the /review hub,
  // which already surfaces cards for in-progress lessons. Reflection remains a
  // post-completion activity and stays gated on lesson completion.
  if (tab === 'quiz' || tab === 'flashcards') return !!prog.theory_read_at
  if (tab === 'reflection') return prog.status === 'completed'
  return false
}

// ─── Phase 3 first-session helpers (exported for unit testing) ───────────────

/**
 * Phase 3 (3.2): whether a quiz submission response means the lesson is now complete.
 * When true, the lesson shell renders the completion screen directly on quiz
 * completion, so the learner is never stranded on the quiz tab after skipping the
 * optional reflection.
 */
export function lessonCompletedFromQuiz(
  res: { isCompleted?: boolean; success?: boolean } | null | undefined
): boolean {
  return !!res && (res.isCompleted === true || res.success === true)
}

/**
 * Phase 3 (3.6): where finishing the flashcard deck should send the learner. Once
 * flashcards can be reached before the quiz, advancing to a still-locked reflection
 * tab would be wrong — send them to the quiz until the lesson is complete.
 */
export function flashcardsAdvanceTarget(isReflectionUnlocked: boolean): TabType {
  return isReflectionUnlocked ? 'reflection' : 'quiz'
}

/**
 * Phase 3 (3.3): the completion screen's primary CTA names the next lesson when known.
 */
export function nextLessonCtaLabel(nextLessonTitle: string | null | undefined): string {
  return nextLessonTitle ? `Next Lesson: ${nextLessonTitle} →` : 'Continue to Next Lesson →'
}

// ─── Theory engagement tracker ───────────────────────────────────────────────

function useTheoryEngagement(isActiveTab: boolean) {
  const activeSecondsRef = useRef(0)
  const scrollPercentRef = useRef(0)
  const activeRef = useRef(true)

  // Track active tab focus time
  useEffect(() => {
    const onVisibility = () => { activeRef.current = !document.hidden && isActiveTab }
    document.addEventListener('visibilitychange', onVisibility)
    const interval = setInterval(() => {
      if (activeRef.current && isActiveTab) {
        activeSecondsRef.current += 1
      }
    }, 1000)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isActiveTab])

  // Track scroll depth (max monotonically increasing)
  useEffect(() => {
    if (!isActiveTab) return
    const onScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) {
        scrollPercentRef.current = 100
        return
      }
      const pct = Math.min(100, Math.round((window.scrollY / docHeight) * 100))
      scrollPercentRef.current = Math.max(scrollPercentRef.current, pct)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [isActiveTab])

  return { activeSecondsRef, scrollPercentRef }
}

// ─── Reflection block wrapper — injects submission logic ─────────────────────
// The compiled reflection block just holds `prompts[]`. We inject a form around it.

function ReflectionForm({
  lesson,
  mainPrompt,
  prompts,
  initialContent = '',
  initialIsPublic = false,
  onSaveSuccess,
  onComplete,
}: {
  lesson: CompiledLesson
  mainPrompt: string
  prompts: string[]
  initialContent?: string
  initialIsPublic?: boolean
  onSaveSuccess: () => void
  onComplete: () => void
}) {
  const [content, setContent] = useState(initialContent)
  const [isPublic, setIsPublic] = useState(initialIsPublic)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [xpEarned, setXpEarned] = useState<number | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || saving) return

    setSaving(true)
    setError(null)

    const res = await apiPost<{ xpEarned?: number }>('/api/reflections', {
      lesson_id: lesson.id,
      content: content.trim(),
      is_public: isPublic,
    })

    setSaving(false)

    if (!res.ok) {
      setError(res.error.message)
      return
    }

    setXpEarned(res.data?.xpEarned ?? 0)
    onSaveSuccess()
    setTimeout(() => onComplete(), 2000)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Reflection prompts */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary font-bold text-sm">
          <Edit3 className="h-4 w-4" />
          Reflection Prompt
        </div>
        <p className="text-sm text-foreground/80 leading-relaxed">{mainPrompt}</p>
        {prompts.length > 1 && (
          <ul className="space-y-2 mt-2">
            {prompts.slice(1).map((p, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                <span className="text-primary shrink-0">→</span>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>

      {xpEarned !== null ? (
        <div className="text-center py-8 space-y-3 animate-fade-in">
          <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg">
            Reflection saved! +{xpEarned} XP earned.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <textarea
            id="reflection-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your reflection here..."
            rows={8}
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="reflection-public"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-border"
            />
            <label htmlFor="reflection-public" className="text-xs text-muted-foreground font-medium">
              Make this reflection public (visible on portfolio export)
            </label>
          </div>

          {error && (
            <p className="text-xs text-destructive font-semibold">{error}</p>
          )}

          <Button
            type="submit"
            disabled={!content.trim() || saving}
            size="lg"
            className="w-full font-bold"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Submit Reflection'
            )}
          </Button>
        </form>
      )}
    </div>
  )
}

function ReflectionTabContent({
  lesson,
  onComplete,
}: {
  lesson: CompiledLesson
  onComplete: () => void
}) {
  const reflectionBlock = lesson.blocks.find((b) => b.type === 'reflection')
  const prompts: string[] = reflectionBlock?.prompts ?? []
  const mainPrompt = prompts[0] ?? 'Reflect on what you learned in this lesson.'

  const { data: reflectionData, isLoading, mutate: mutateReflection } = useApiQuery<{
    content?: string
    is_public?: boolean
  }>(lesson?.id ? `/api/reflections?lesson_id=${lesson.id}` : null)

  if (isLoading && !reflectionData) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground">
        Loading reflection...
      </div>
    )
  }

  return (
    <ReflectionForm
      key={reflectionData?.content ? 'loaded' : 'empty'}
      lesson={lesson}
      mainPrompt={mainPrompt}
      prompts={prompts}
      initialContent={reflectionData?.content ?? ''}
      initialIsPublic={reflectionData?.is_public ?? false}
      onSaveSuccess={() => void mutateReflection()}
      onComplete={onComplete}
    />
  )
}


// ─── Theory read completion button ──────────────────────────────────────────

function TheoryReadButton({
  theoryReadAt,
  onComplete,
  isLoading,
  error,
}: {
  theoryReadAt: string | null
  onComplete: () => void
  isLoading: boolean
  error?: string | null
}) {
  if (theoryReadAt) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
          <Award className="h-5 w-5" />
          Theory section completed. Quiz is now unlocked!
        </div>
        <Button onClick={onComplete} variant="outline" size="lg" className="font-semibold">
          Proceed to Quiz →
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 p-3 text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 rounded-xl max-w-md w-full text-left"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button onClick={onComplete} disabled={isLoading} size="lg" className="font-bold px-8">
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Recording...
          </>
        ) : (
          'Mark Theory as Read →'
        )}
      </Button>
    </div>
  )
}

// ─── Core reading progress (Phase 4 revised, Step 7) ─────────────────────────
//
// A quiet reading-progress affordance for the Core surface. The revised direction keeps a
// fuller (honest 10–15 min) Core, so the UX job is to lower PERCEIVED effort: a thin sticky
// bar plus a "Core · ~N min" label gives the learner "you are here / this is finite" context
// without gamification. Purely presentational; it reads window scroll and never gates anything.
// Honours reduced-motion (the width transition is the only motion and is disabled below).

function CoreReadingProgress({ estimatedMinutes }: { estimatedMinutes: number }) {
  const [percent, setPercent] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      setPercent(max <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((window.scrollY / max) * 100))))
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="sticky top-0 z-10 -mx-6 md:-mx-8 -mt-6 md:-mt-8 mb-6 px-6 md:px-8 pt-4 pb-3 bg-card/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="inline-flex items-center gap-2 font-bold uppercase tracking-wider text-primary">
          <BookOpen className="h-3.5 w-3.5" />
          Core
          {estimatedMinutes > 0 && (
            <span className="font-medium normal-case tracking-normal text-muted-foreground">
              · ~{estimatedMinutes} min · the complete concept
            </span>
          )}
        </span>
        <span className="font-semibold text-muted-foreground tabular-nums" aria-hidden="true">
          {percent}%
        </span>
      </div>
      <div
        className="h-1 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-label="Core reading progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function LessonPageContent({
  lesson,
  prevLessonUrl,
  nextLessonUrl,
  nextLessonTitle,
  globalOrder,
  moduleNumber,
  moduleName,
  initialProgress,
  recutVariant = 'control',
}: LessonPageContentProps) {
  const {
    progress,
    loading,
    error,
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
    recordDeepDiveOpened,
  } = useLessonProgressV2(lesson.id, initialProgress)

  // Phase 4: Core / Deep-dive derived once per lesson. Under control these are unused (the
  // theory surface renders the full block set) but computing them is cheap and pure.
  const deepDiveBlocks = React.useMemo(() => getDeepDiveBlocks(lesson.blocks), [lesson.blocks])
  const coreReadingMinutes = React.useMemo(() => getCoreReadingMinutes(lesson), [lesson])
  const deepDiveReadingMinutes = React.useMemo(
    () => getDeepDiveReadingMinutes(lesson),
    [lesson]
  )
  const isTreatment = recutVariant === 'treatment'
  const headerReadingMinutes = isTreatment ? coreReadingMinutes : lesson.estimatedReadingTime

  const searchParams = useSearchParams()
  const initialTabParam = searchParams.get('tab') as TabType | null

  // Initialize active tab from query param if unlocked, else default to 'theory'
  const initialActiveTab: TabType = (
    initialTabParam &&
    ['theory', 'quiz', 'flashcards', 'reflection'].includes(initialTabParam) &&
    isTabUnlocked(initialTabParam, initialProgress)
  ) ? initialTabParam : 'theory'

  const [activeTab, setActiveTab] = useState<TabType>(initialActiveTab)
  const [completedThisSession, setCompletedThisSession] = useState(false)
  // Quiz score for the session, surfaced on the completion screen (Phase 3, 3.2/3.3).
  const [sessionQuizScore, setSessionQuizScore] = useState<number | null>(null)
  const [theorySubmitting, setTheorySubmitting] = useState(false)
  const [theoryError, setTheoryError] = useState<string | null>(null)
  const [showFirstSessionCelebration, setShowFirstSessionCelebration] = useState(false)
  const [celebrationXp, setCelebrationXp] = useState(50)
  const { activeSecondsRef, scrollPercentRef } = useTheoryEngagement(activeTab === 'theory')
  const hasTrackedStartRef = useRef(false)

  const hasTrackedQuizStartRef = useRef(false)

  // Track lesson start once per lesson mount. Phase 4: also emit the experiment exposure and
  // the first Core view here (the theory surface is the default tab), so the consenting-
  // visitor GA4 stream mirrors the server-side funnel's opened → core → quiz → complete path.
  useEffect(() => {
    if (!hasTrackedStartRef.current && lesson?.id) {
      hasTrackedStartRef.current = true
      trackLessonStarted(lesson.id, lesson.module)
      trackRecutExperimentExposed(lesson.id, recutVariant)
      trackCoreViewed(lesson.id, recutVariant)
    }
  }, [lesson.id, lesson.module, recutVariant])

  // Track the first time the quiz tab is opened, with the number of questions presented
  // (5 under treatment, 15 under control) — the "quiz started" funnel step.
  useEffect(() => {
    if (activeTab === 'quiz' && !hasTrackedQuizStartRef.current) {
      hasTrackedQuizStartRef.current = true
      const quizBlock = lesson.blocks.find((b) => b.type === 'quiz')
      trackQuizStarted(lesson.id, quizBlock?.questions?.length ?? 0)
    }
  }, [activeTab, lesson.id, lesson.blocks])

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (tab === 'theory') {
        url.searchParams.delete('tab')
      } else {
        url.searchParams.set('tab', tab)
      }
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
  }, [])

  const { setBreadcrumbs } = useBreadcrumbs()

  // Sync breadcrumbs with topbar — use globalOrder for correct display
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Curriculum', href: '/academy' },
      { label: `Module ${String(moduleNumber).padStart(2, '0')}: ${moduleName}`, href: `/academy#${lesson.module}` },
      { label: `Lesson ${globalOrder}: ${lesson.title}` },
    ])
    return () => setBreadcrumbs([])
  }, [lesson, globalOrder, moduleNumber, moduleName, setBreadcrumbs])


  // Handle browser back/forward (popstate) between tabs
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = params.get('tab') as TabType | null
      if (tab && ['theory', 'quiz', 'flashcards', 'reflection'].includes(tab)) {
        if (isTabUnlocked(tab, progress)) {
          setActiveTab(tab)
          return
        }
      }
      setActiveTab('theory')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [progress])

  // Mark in-progress on first open
  useEffect(() => {
    if (progress && progress.status === 'not_started') {
      markInProgress()
    }
  }, [progress, markInProgress])

  const handleQuizComplete = useCallback(
    async (attempts: { question_id: string; selected_option: number; is_correct: boolean }[]) => {
      const res = await recordQuizAttempt(attempts)
      if (res) {
        trackQuizCompleted(lesson.id, res.score)
        if (lessonCompletedFromQuiz(res)) {
          trackLessonCompleted(lesson.id, lesson.title, res.xpEarned)

          // Phase 3 (3.2): the completion screen was previously reachable only via the
          // optional reflection, so finishing the quiz and skipping reflection left the
          // learner stranded on the quiz tab. Render it on quiz completion instead.
          setSessionQuizScore(
            typeof res.scorePercentage === 'number' ? res.scorePercentage : res.score ?? null
          )
          setCompletedThisSession(true)

          // Check if this was the learner's very first completed lesson
          if (res.isFirstLesson) {
            trackFirstLessonCompleted(lesson.id, res.xpEarned)

            // Deduplication lock: celebrate once per learner browser/session
            try {
              const alreadyCelebrated =
                typeof window !== 'undefined' &&
                localStorage.getItem('prodily_first_session_celebrated') === 'true'

              if (!alreadyCelebrated) {
                localStorage.setItem('prodily_first_session_celebrated', 'true')
                setCelebrationXp(res.xpEarned || 50)
                setShowFirstSessionCelebration(true)
              }
            } catch {
              // LocalStorage unavailable - fallback to in-memory trigger
              setCelebrationXp(res.xpEarned || 50)
              setShowFirstSessionCelebration(true)
            }
          }
        }
      }
      return res
    },
    [lesson.id, lesson.title, recordQuizAttempt]
  )

  // Loading state
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
        <Link href="/academy" className="text-primary hover:underline text-sm font-semibold">
          Return to Curriculum
        </Link>
      </div>
    )
  }

  // Tab lock state
  const isQuizUnlocked = !!progress.theory_read_at
  // Phase 3 (3.6): flashcards unlock after theory is read (retrieval practice before the
  // quiz), consistent with isTabUnlocked and the /review hub. Reflection stays post-completion.
  const isFlashcardsUnlocked = !!progress.theory_read_at
  const isReflectionUnlocked = progress.status === 'completed'

  const handleTheoryComplete = async () => {
    setTheorySubmitting(true)
    setTheoryError(null)
    try {
      await recordTheoryRead(activeSecondsRef.current, scrollPercentRef.current)
      trackTheoryRead(lesson.id)
      handleTabChange('quiz')
    } catch (err: unknown) {
      const msg = (err instanceof Error && err.message)
        ? err.message
        : 'Engagement threshold not met. Please review the theory content thoroughly before proceeding to the quiz.'
      setTheoryError(msg)
      dispatchClientNotificationEvent({
        title: 'Engagement Requirement',
        body: msg,
        variant: 'error',
      })
    } finally {
      setTheorySubmitting(false)
    }
  }

  const handleReflectionComplete = () => {
    setCompletedThisSession(true)
  }

  // ── Lesson Mastered screen ────────────────────────────────────────────────
  if (completedThisSession) {
    // A module is complete when the globalOrder is divisible by 10 (lessons 10, 20, 30... 90)
    const isModuleComplete = globalOrder % 10 === 0

    if (isModuleComplete) {
      return (
        <div className="max-w-lg mx-auto text-center py-12 space-y-8 animate-scale-up">
          <div className="flex justify-center">
            <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 shadow-sm">
              <Trophy className="h-10 w-10" />
            </div>
          </div>

          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold uppercase tracking-wider">
              Module Achievement Unlocked
            </span>
            <h1 className="text-3xl md:text-4xl font-bold font-serif text-foreground">
              Module {moduleNumber} Completed!
            </h1>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              Congratulations! You have completed all 10 lessons in <strong>{moduleName}</strong> and unlocked the Module Capstone Deliverable.
            </p>
          </div>

          {/* Module Capstone Card */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-left space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Capstone Project Available
              </span>
              <span className="text-xs font-bold text-emerald-500">+100 XP</span>
            </div>
            <h3 className="text-lg font-bold font-serif text-foreground">
              {moduleName} Capstone Project
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Apply what you learned across Module {moduleNumber} by building a real-world product deliverable for your public portfolio.
            </p>
            <Link
              href={`/capstones/${lesson.module}`}
              className="inline-flex items-center justify-center w-full rounded-xl bg-primary px-5 py-3 text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition-all"
            >
              Start Capstone Project →
            </Link>
          </div>

          {/* Navigation Actions */}
          <div className="flex flex-col gap-3">
            {nextLessonUrl && (
              <Link
                href={nextLessonUrl}
                className="inline-flex items-center justify-center rounded-xl bg-secondary border border-border px-6 py-3.5 text-sm font-bold text-foreground hover:bg-secondary/80 transition-all"
              >
                Continue to Next Module →
              </Link>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/review"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-accent/40 transition-all"
              >
                Review Flashcards
              </Link>
              <button
                type="button"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `Completed Module ${moduleNumber} on PM Academy`,
                      url: window.location.href,
                    }).catch(() => {})
                  } else {
                    navigator.clipboard.writeText(window.location.href)
                    alert('Achievement link copied to clipboard!')
                  }
                }}
                className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-accent/40 transition-all"
              >
                Share Achievement
              </button>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-8 animate-scale-up">
        <div className="flex justify-center">
          <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/25 text-primary shadow-sm">
            <Award className="h-10 w-10" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-bold font-serif text-foreground">Lesson Completed!</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            You have mastered <strong>{lesson.title}</strong>. Your skill radar has been updated.
          </p>
          {sessionQuizScore !== null && (
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              You scored {sessionQuizScore}% on the practice quiz.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {nextLessonUrl ? (
            <Link
              href={nextLessonUrl}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
            >
              {/* Phase 3 (3.3): name the next lesson so the milestone points somewhere concrete. */}
              {nextLessonCtaLabel(nextLessonTitle)}
            </Link>
          ) : (
            <div className="p-4 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 text-sm font-bold">
              👑 You have completed all 90 lessons!
            </div>
          )}
          {prevLessonUrl && (
            <Link
              href={prevLessonUrl}
              className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3.5 text-sm font-semibold text-foreground hover:bg-accent/40 transition-all"
            >
              ← Go to Previous Lesson
            </Link>
          )}
          <Link
            href={`/academy#${lesson.module}`}
            className="inline-flex items-center justify-center rounded-xl border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            Back to Curriculum
          </Link>
        </div>
      </div>
    )
  }

  // ── Tab definitions ──────────────────────────────────────────────────────
  const tabs = [
    { id: 'theory' as const, label: 'Theory', icon: BookOpen, unlocked: true },
    { id: 'quiz' as const, label: 'Practice Quiz', icon: CheckSquare, unlocked: isQuizUnlocked },
    { id: 'flashcards' as const, label: 'Flashcards', icon: Layers, unlocked: isFlashcardsUnlocked },
    { id: 'reflection' as const, label: 'Reflection', icon: Edit3, unlocked: isReflectionUnlocked },
  ]


  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl space-y-8">
      {/* Navigation & Tab Headers */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-4">
        <Link
          href={`/academy#${lesson.module}`}
          className="inline-flex items-center gap-2 px-3.5 py-2.5 -ml-3.5 min-h-[44px] rounded-lg text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Curriculum</span>
        </Link>

        {/* Tab navigation */}
        <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lesson Sections">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                disabled={!tab.unlocked}
                onClick={() => handleTabChange(tab.id)}
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

      {/* Lesson Header (theory tab only) */}
      {activeTab === 'theory' && (
        <div className="border-b border-border pb-6 mb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            <span>Module {moduleNumber}: {moduleName}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>Lesson {globalOrder}</span>
            <span className="text-muted-foreground/40">•</span>
            {/* Phase 4 (§4.3, Step 6): honest estimate. Treatment shows the computed Core
                reading time and labels it as Core; control keeps the authored figure. */}
            <span>
              {headerReadingMinutes} min {isTreatment ? 'Core read' : 'read'}
            </span>
            <span className="text-muted-foreground/40">•</span>
            <span className="flex items-center gap-1">
              Difficulty:{' '}
              <span className="text-foreground font-semibold">
                {'★'.repeat(lesson.difficulty)}{'☆'.repeat(Math.max(0, 5 - lesson.difficulty))}
              </span>
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold font-serif text-foreground leading-tight">
            {lesson.title}
          </h1>
        </div>
      )}

      {/* Tab Panels */}
      <div className="rounded-xl border border-border bg-card p-6 md:p-8 shadow-sm">
        {/* Theory Panel */}
        {activeTab === 'theory' && (
          <div id="panel-theory" role="tabpanel" aria-labelledby="tab-theory">
            {/* Phase 4 (revised, Step 7): quiet Core progress affordance — lowers perceived
                effort for a fuller Core without gamification. Treatment only. */}
            {isTreatment && (
              <CoreReadingProgress estimatedMinutes={coreReadingMinutes} />
            )}
            <LessonContextProvider
              lessonId={lesson.id}
              onQuizComplete={handleQuizComplete}
              onAdvanceTab={(tab) => handleTabChange(tab)}
            >
              <BlockTreeRenderer
                blocks={getBlocksForTab(lesson.blocks, 'theory', recutVariant)}
                lessonId={lesson.id}
              />
            </LessonContextProvider>
            <TheoryReadButton
              theoryReadAt={progress.theory_read_at}
              onComplete={handleTheoryComplete}
              isLoading={theorySubmitting}
              error={theoryError}
            />
            {/* Phase 4 (§4.1): Deep-dive is visible, labelled and reachable — rendered below
                the Core so it is never required to unlock the quiz, and mounted lazily so it
                does not enlarge the Core payload or the theory-gate scroll surface. Only under
                the treatment variant; control renders the full lesson inline above. */}
            {isTreatment && deepDiveBlocks.length > 0 && (
              <DeepDiveSection
                blocks={deepDiveBlocks}
                lessonId={lesson.id}
                estimatedMinutes={deepDiveReadingMinutes}
                onOpen={() => {
                  trackDeepDiveOpened(lesson.id)
                  void recordDeepDiveOpened()
                }}
              />
            )}
          </div>
        )}

        {/* Quiz Panel */}
        {activeTab === 'quiz' && (
          <div id="panel-quiz" role="tabpanel" aria-labelledby="tab-quiz">
            <LessonContextProvider
              lessonId={lesson.id}
              onQuizComplete={handleQuizComplete}
              onAdvanceTab={(tab) => handleTabChange(tab)}
            >
              <BlockTreeRenderer
                blocks={getBlocksForTab(lesson.blocks, 'quiz')}
                lessonId={lesson.id}
              />
            </LessonContextProvider>
          </div>
        )}

        {/* Flashcards Panel */}
        {activeTab === 'flashcards' && (
          <div id="panel-flashcards" role="tabpanel" aria-labelledby="tab-flashcards">
            <LessonContextProvider
              lessonId={lesson.id}
              onAdvanceTab={(tab) => handleTabChange(tab)}
              onFlashcardsComplete={() =>
                // Flashcards can now be reached before the quiz (3.6). Only advance to
                // reflection once it is actually unlocked (lesson completed); otherwise
                // send the learner on to the quiz, the natural next step.
                handleTabChange(flashcardsAdvanceTarget(isReflectionUnlocked))
              }
            >
              <BlockTreeRenderer
                blocks={getBlocksForTab(lesson.blocks, 'flashcards')}
                lessonId={lesson.id}
              />
            </LessonContextProvider>
          </div>
        )}

        {/* Reflection Panel */}
        {activeTab === 'reflection' && (
          <div id="panel-reflection" role="tabpanel" aria-labelledby="tab-reflection">
            <ReflectionTabContent lesson={lesson} onComplete={handleReflectionComplete} />
          </div>
        )}
      </div>

      {/* Lesson Clarity Feedback Loop (Phase 6) */}
      <LessonFeedbackWidget lessonId={lesson.id} className="mt-6" />

      {/* Lesson Footer Navigation */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center pt-6 border-t border-border/60 text-xs">
        {prevLessonUrl ? (
          <Link
            href={prevLessonUrl}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card font-semibold text-foreground hover:bg-accent/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Previous Lesson</span>
          </Link>
        ) : (
          <div className="hidden sm:block" />
        )}

        <Link
          href={`/academy#${lesson.module}`}
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5 text-primary font-bold hover:bg-primary/10 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          View Curriculum
        </Link>
        
        {nextLessonUrl && progress.status === 'completed' ? (
          <Link
            href={nextLessonUrl}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card font-semibold text-foreground hover:bg-accent/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span>Next Lesson</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <div className="hidden sm:block" />
        )}
      </div>

      <FirstSessionCelebrationModal
        isOpen={showFirstSessionCelebration}
        onClose={() => setShowFirstSessionCelebration(false)}
        lessonId={lesson.id}
        xpEarned={celebrationXp}
        nextLessonUrl={nextLessonUrl}
      />
    </div>
  )
}
