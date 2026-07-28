'use client'

import React, { useEffect, useState } from 'react'
import type { ParsedLesson } from '@/types'
import { CheckCircle2, Flame, Loader2, BookOpen, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TheorySectionProps {
  lesson: ParsedLesson
  theoryReadAt: string | null
  onCompleteReading: (activeSeconds: number, scrollPercent: number) => Promise<void>
  onProceedToQuiz: () => void
}

export default function TheorySection({
  lesson,
  theoryReadAt,
  onCompleteReading,
  onProceedToQuiz,
}: TheorySectionProps) {
  const [activeSeconds, setActiveSeconds] = useState(0)
  const [scrollPercent, setScrollPercent] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const estMin = lesson.meta.estMinutesReading || 2
  const minRequiredTime = Math.max(45, Math.floor(estMin * 60 * 0.2))

  // 1. Monitor scroll depth
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) {
        setScrollPercent(100)
        return
      }
      const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100))
      setScrollPercent((prev) => Math.max(prev, pct))
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 2. Monitor active focus dwell time
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hasFocus()) {
        setActiveSeconds((prev) => prev + 1)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const hasRead = !!theoryReadAt
  const timeProgress = Math.min(100, Math.round((activeSeconds / minRequiredTime) * 100))
  const scrollProgress = Math.min(100, Math.round((scrollPercent / 80) * 100))
  const isEligible = activeSeconds >= minRequiredTime && scrollPercent >= 80

  const handleComplete = async () => {
    if (!isEligible || isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await onCompleteReading(activeSeconds, scrollPercent)
      onProceedToQuiz()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Verification failed. Try reading a bit more.'
      setError(errorMsg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Learning Objectives */}
      {lesson.learningObjectives && lesson.learningObjectives.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-primary font-semibold mb-3">
            <BookOpen className="h-5 w-5" />
            <h2 className="text-base font-bold text-foreground">Learning Objectives</h2>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-foreground/80 list-disc list-inside">
            {lesson.learningObjectives.map((obj, i) => (
              <li key={i} className="leading-relaxed">{obj}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Theory Content (Prose) */}
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <div className="whitespace-pre-line text-foreground/90 leading-relaxed font-sans text-base md:text-lg">
          {lesson.theory}
        </div>
      </div>

      {/* Mental Model Block */}
      {lesson.mentalModel && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase">
              Mental Model
            </div>
            <h3 className="text-lg font-bold text-foreground font-serif">
              {lesson.mentalModel.title}
            </h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {lesson.mentalModel.content}
          </p>
          {lesson.mentalModel.diagramMermaid && (
            <div className="mt-4 rounded-lg bg-muted p-4 font-mono text-xs overflow-x-auto border border-border">
              <pre className="text-muted-foreground">{lesson.mentalModel.diagramMermaid}</pre>
            </div>
          )}
        </div>
      )}

      {/* Case Study Block */}
      {lesson.caseStudy && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-bold uppercase">
              Case Study
            </div>
            <h3 className="text-lg font-bold text-foreground font-serif">
              {lesson.caseStudy.title}
            </h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {lesson.caseStudy.content}
          </p>
        </div>
      )}

      {/* Framework Table / Block */}
      {lesson.framework && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase">
              Framework & Tools
            </div>
            <h3 className="text-lg font-bold text-foreground font-serif">
              {lesson.framework.title}
            </h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {lesson.framework.content}
          </p>
        </div>
      )}

      {/* Common Mistakes */}
      {lesson.mistakes && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-destructive/10 pb-3 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <h3 className="text-lg font-bold font-serif">Common Pitfalls</h3>
          </div>
          <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {lesson.mistakes}
          </div>
        </div>
      )}

      {/* Real World Perspective */}
      {lesson.realWorldPerspective && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <div className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase">
              Real-World Perspective
            </div>
            <h3 className="text-lg font-bold text-foreground font-serif">
              {lesson.realWorldPerspective.title}
            </h3>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
            {lesson.realWorldPerspective.content}
          </p>
        </div>
      )}

      {/* Connections / Key Concepts */}
      {lesson.connections && (
        <div className="text-xs text-muted-foreground/80 leading-relaxed border-t border-border pt-4 mt-8">
          <h4 className="font-semibold uppercase tracking-wider mb-1">Module Connections & Context</h4>
          <p>{lesson.connections}</p>
        </div>
      )}

      {/* Progress & Verification Gates */}
      <div className="mt-12 pt-6 border-t border-border">
        {hasRead ? (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 shrink-0" />
              <div>
                <h4 className="font-bold text-foreground">Theory reading completed!</h4>
                <p className="text-xs text-muted-foreground mt-0.5">+10 XP successfully claimed.</p>
              </div>
            </div>
            <Button onClick={onProceedToQuiz} size="lg" className="w-full sm:w-auto font-medium">
              Continue to Quiz →
            </Button>
          </div>
        ) : (
          <div className="p-6 rounded-xl border border-border bg-card space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="font-bold text-foreground">Engagement Anti-Gaming Guard</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Spend at least {minRequiredTime}s active and scroll through 80% of the lesson content to unlock the quiz.
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs font-semibold uppercase px-2.5 py-1 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <Flame className="h-4 w-4" />
                <span>+10 XP Theory Read</span>
              </div>
            </div>

            {/* Verification status bars */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Active Dwell Time</span>
                  <span className="text-foreground">{activeSeconds}s / {minRequiredTime}s ({timeProgress}%)</span>
                </div>
                <div className="w-full h-2 rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${timeProgress >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${timeProgress}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">Scroll Depth Progress</span>
                  <span className="text-foreground">{scrollPercent}% / 80% ({scrollProgress}%)</span>
                </div>
                <div className="w-full h-2 rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${scrollProgress >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${scrollProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 text-sm rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={handleComplete}
                disabled={!isEligible || isSubmitting}
                size="lg"
                className="w-full sm:w-auto font-medium"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying...
                  </>
                ) : isEligible ? (
                  'Complete Theory & Unlock Quiz'
                ) : (
                  'Read to Unlock Quiz'
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
