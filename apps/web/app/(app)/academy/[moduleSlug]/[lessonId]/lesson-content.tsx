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
  Loader2,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useBreadcrumbs } from '@/contexts/breadcrumb-context'



// ─── Props ───────────────────────────────────────────────────────────────────

interface LessonPageContentProps {
  lesson: CompiledLesson
  prevLessonUrl: string | null
  nextLessonUrl: string | null
}

type TabType = 'theory' | 'quiz' | 'flashcards' | 'reflection'

// ─── Helper: extract blocks by type ─────────────────────────────────────────

function getBlocksForTab(blocks: CompiledBlock[], tab: TabType): CompiledBlock[] {
  if (tab === 'theory') {
    // Theory tab: everything except quiz, flashcardDeck, reflection, connections
    const EXCLUDED = new Set(['quiz', 'flashcardDeck', 'reflection', 'connections'])
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

// ─── Module name formatter ───────────────────────────────────────────────────

function formatModuleName(moduleSlug: string): string {
  const nameMap: Record<string, string> = {
    'foundations': 'Foundations',
    'discovery': 'Discovery & User Research',
    'strategy': 'Product Strategy',
    'execution': 'Product Execution',
    'growth': 'Growth & Metrics',
    'leadership': 'PM Leadership',
    'technical': 'Technical Fundamentals',
    'design': 'Design Thinking',
    'capstone': 'Capstone Projects',
  }
  return nameMap[moduleSlug] ?? moduleSlug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function LessonPageContent({
  lesson,
  prevLessonUrl,
  nextLessonUrl,
}: LessonPageContentProps) {
  const {
    progress,
    loading,
    error,
    markInProgress,
    recordTheoryRead,
    recordQuizAttempt,
  } = useLessonProgressV2(lesson.id)

  const [activeTab, setActiveTab] = useState<TabType>('theory')
  const [completedThisSession, setCompletedThisSession] = useState(false)
  const [theorySubmitting, setTheorySubmitting] = useState(false)
  const { activeSecondsRef, scrollPercentRef } = useTheoryEngagement(activeTab === 'theory')

  const { setBreadcrumbs } = useBreadcrumbs()
  const moduleNumber = Math.ceil(lesson.order / 10)
  const moduleName = formatModuleName(lesson.module)

  // Sync breadcrumbs with topbar
  useEffect(() => {
    setBreadcrumbs([
      { label: 'Curriculum', href: '/academy' },
      { label: `Module ${String(moduleNumber).padStart(2, '0')}: ${moduleName}`, href: `/academy#${lesson.module}` },
      { label: `Lesson ${lesson.order}: ${lesson.title}` },
    ])
    return () => setBreadcrumbs([])
  }, [lesson, moduleNumber, moduleName, setBreadcrumbs])

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
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
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
            <span>Lesson {lesson.order}</span>
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
      <div className="flex justify-between items-center pt-4 border-t border-border/60">
        {prevLessonUrl ? (
          <Link
            href={prevLessonUrl}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            ← Previous Lesson
          </Link>
        ) : (
          <div />
        )}
        
        {nextLessonUrl && progress.status === 'completed' ? (
          <Link
            href={nextLessonUrl}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-accent/40 transition-all"
          >
            Next Lesson →
          </Link>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
