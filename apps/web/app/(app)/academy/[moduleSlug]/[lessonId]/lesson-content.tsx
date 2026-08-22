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
import { useLessonProgressV2 } from '@/hooks/use-lesson-progress-v2'
import { BlockTreeRenderer } from '@/renderer/block-tree-renderer'
import { LessonContextProvider } from '@/contexts/lesson-context'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBreadcrumbs } from '@/contexts/breadcrumb-context'



// ─── Props ───────────────────────────────────────────────────────────────────

import type { LessonProgressV2 } from '@/hooks/use-lesson-progress-v2'

interface LessonPageContentProps {
  lesson: CompiledLesson
  prevLessonUrl: string | null
  nextLessonUrl: string | null
  globalOrder: number       // 1-indexed global curriculum position (1..90)
  moduleNumber: number      // 1-indexed module number (1..9)
  moduleName: string        // formatted module display name
  initialProgress?: LessonProgressV2 | null
}

type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

// ─── Helper: extract blocks by type ─────────────────────────────────────────

function getBlocksForTab(blocks: CompiledBlock[], tab: TabType): CompiledBlock[] {
  if (tab === 'theory') {
    // Theory tab: everything except quiz, flashcardDeck, reflection
    // (connections is authored lesson content — rendered at the end of the theory tab)
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

  const [content, setContent] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [xpEarned, setXpEarned] = useState<number | null>(null)

  // Load existing reflection
  useEffect(() => {
    fetch(`/api/reflections?lesson_id=${lesson.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.content) setContent(data.content)
        if (data?.is_public) setIsPublic(data.is_public)
      })
      .catch(() => {})
  }, [lesson.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || saving) return

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lesson.id,
          content: content.trim(),
          is_public: isPublic,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save reflection')
      setXpEarned(data.xpEarned ?? 0)
      setTimeout(() => onComplete(), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
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

// ─── Theory read completion button ──────────────────────────────────────────

function TheoryReadButton({
  theoryReadAt,
  onComplete,
  isLoading,
}: {
  theoryReadAt: string | null
  onComplete: () => void
  isLoading: boolean
}) {
  if (theoryReadAt) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
          <Award className="h-5 w-5" />
          Theory section completed — quiz is now unlocked!
        </div>
        <Button onClick={onComplete} variant="outline" size="lg" className="font-semibold">
          Proceed to Quiz →
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-8 flex justify-center">
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

// ─── Main component ──────────────────────────────────────────────────────────

export default function LessonPageContent({
  lesson,
  prevLessonUrl,
  nextLessonUrl,
  globalOrder,
  moduleNumber,
  moduleName,
  initialProgress,
}: LessonPageContentProps) {
  const {
    progress,
    loading,
    error,
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
  } = useLessonProgressV2(lesson.id, initialProgress)

  const [activeTab, setActiveTab] = useState<TabType>('theory')
  const [completedThisSession, setCompletedThisSession] = useState(false)
  const [theorySubmitting, setTheorySubmitting] = useState(false)
  const { activeSecondsRef, scrollPercentRef } = useTheoryEngagement(activeTab === 'theory')

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

  // Mark in-progress on first open
  useEffect(() => {
    if (progress && progress.status === 'not_started') {
      markInProgress()
    }
  }, [progress, markInProgress])

  const handleQuizComplete = useCallback(
    async (attempts: { question_id: string; selected_option: number; is_correct: boolean }[]) => {
      return await recordQuizAttempt(attempts)
    },
    [recordQuizAttempt]
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
  const isFlashcardsUnlocked = progress.status === 'completed'
  const isReflectionUnlocked = progress.status === 'completed'

  const handleTheoryComplete = async () => {
    setTheorySubmitting(true)
    try {
      await recordTheoryRead(activeSecondsRef.current, scrollPercentRef.current)
      setActiveTab('quiz')
    } catch {
      // Engagement threshold not met — still allow navigation
      setActiveTab('quiz')
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
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-amber-500/30 blur-lg animate-pulse" />
              <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-xl">
                <Trophy className="h-12 w-12" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider">
              🏆 Module Achievement Unlocked
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
            You have mastered <strong>{lesson.title}</strong>. Your skill radar has been updated.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {nextLessonUrl ? (
            <Link
              href={nextLessonUrl}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow hover:bg-primary/95 transition-all"
            >
              Continue to Next Lesson →
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
            href="/academy"
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
          href="/academy"
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

      {/* Lesson Header (theory tab only) */}
      {activeTab === 'theory' && (
        <div className="border-b border-border pb-6 mb-2">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-3">
            <span>Module {moduleNumber}: {moduleName}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>Lesson {globalOrder}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>{lesson.estimatedReadingTime} min read</span>
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
            <LessonContextProvider
              lessonId={lesson.id}
              onQuizComplete={handleQuizComplete}
              onAdvanceTab={(tab) => setActiveTab(tab)}
            >
              <BlockTreeRenderer
                blocks={getBlocksForTab(lesson.blocks, 'theory')}
                lessonId={lesson.id}
              />
            </LessonContextProvider>
            <TheoryReadButton
              theoryReadAt={progress.theory_read_at}
              onComplete={handleTheoryComplete}
              isLoading={theorySubmitting}
            />
          </div>
        )}

        {/* Quiz Panel */}
        {activeTab === 'quiz' && (
          <div id="panel-quiz" role="tabpanel" aria-labelledby="tab-quiz">
            <LessonContextProvider
              lessonId={lesson.id}
              onQuizComplete={handleQuizComplete}
              onAdvanceTab={(tab) => setActiveTab(tab)}
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
            <BlockTreeRenderer
              blocks={getBlocksForTab(lesson.blocks, 'flashcards')}
              lessonId={lesson.id}
            />
          </div>
        )}

        {/* Reflection Panel */}
        {activeTab === 'reflection' && (
          <div id="panel-reflection" role="tabpanel" aria-labelledby="tab-reflection">
            <ReflectionTabContent lesson={lesson} onComplete={handleReflectionComplete} />
          </div>
        )}
      </div>

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
          href="/academy"
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
    </div>
  )
}
