'use client'

/**
 * LessonCapstonePreview — Phase 7 (7.1): surface the capstone from lesson 1.
 *
 * Capstones are Prodily's strongest differentiator but were an "unreachable rumour" — a learner
 * met them only after ~8 of 10 module lessons. This is a lightweight, contextual surface rendered
 * inside the lesson experience so a new learner understands, from their first lesson, that they are
 * working toward a real PM artifact: what it is, why it matters, which module capstone it is,
 * their progress toward eligibility, and what remains.
 *
 * VISIBILITY ≠ ELIGIBILITY. This component only *shows* the destination and links to the capstone
 * page. It never unlocks submission: the draft/submit endpoints re-derive and enforce the
 * eligibility threshold server-side (`lib/capstones-db.ts`). The values here are display-only and
 * come from the same server source, so they cannot be used to bypass the gate.
 */

import React from 'react'
import Link from 'next/link'
import { Award, ArrowRight, CheckCircle2, Lock } from 'lucide-react'
import { getCapstoneDefinition } from '@/config/capstones'
import { useApiQuery } from '@/lib/api/hooks'
import type { CapstoneStatus } from '@/lib/capstones'

interface LessonCapstonePreviewProps {
  moduleSlug: string
  className?: string
}

interface CapstoneModuleResponse {
  success: boolean
  status?: CapstoneStatus
  lessonsCompleted?: number
  totalLessons?: number
  requiredLessons?: number
}

export function LessonCapstonePreview({ moduleSlug, className = '' }: LessonCapstonePreviewProps) {
  const definition = getCapstoneDefinition(moduleSlug)
  // Only modules that actually have a capstone definition get a preview.
  const endpoint = definition ? `/api/capstones/${encodeURIComponent(moduleSlug)}` : null
  const { data } = useApiQuery<CapstoneModuleResponse>(endpoint)

  if (!definition) return null

  const status: CapstoneStatus = data?.status ?? 'locked'
  const requiredLessons = data?.requiredLessons ?? 8
  const lessonsCompleted = data?.lessonsCompleted ?? 0
  const isReady = status !== 'locked'
  const remaining = Math.max(0, requiredLessons - lessonsCompleted)
  const pct = Math.min(100, Math.round((lessonsCompleted / Math.max(1, requiredLessons)) * 100))

  const alreadySubmitted = status === 'submitted' || status === 'reviewed'
  const cta = alreadySubmitted
    ? 'View your deliverable'
    : isReady
      ? 'Open the capstone workspace'
      : 'Preview the capstone'

  return (
    <section
      aria-label="Module capstone you are working toward"
      className={`rounded-2xl border border-primary/20 bg-primary/5 p-5 md:p-6 space-y-3 ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5" aria-hidden="true" /> Where this module leads
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
            alreadySubmitted
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : isReady
                ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                : 'bg-muted text-muted-foreground border-border'
          }`}
        >
          {alreadySubmitted ? (
            <><CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Submitted</>
          ) : isReady ? (
            'Ready to start'
          ) : (
            <><Lock className="w-3 h-3" aria-hidden="true" /> Locked</>
          )}
        </span>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm md:text-base font-bold font-serif text-foreground leading-snug">
          {definition.title}
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {definition.tagline} You&apos;ll produce a real <strong className="text-foreground">{definition.deliverableType}</strong> for your portfolio.
        </p>
      </div>

      {!alreadySubmitted && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-muted-foreground">
              {isReady
                ? 'Eligible to submit'
                : `${lessonsCompleted} of ${requiredLessons} module lessons complete`}
            </span>
            <span className="font-mono text-muted-foreground">{lessonsCompleted}/{requiredLessons}</span>
          </div>
          <div
            className="w-full h-1.5 rounded-full bg-secondary overflow-hidden"
            role="progressbar"
            aria-valuenow={lessonsCompleted}
            aria-valuemin={0}
            aria-valuemax={requiredLessons}
            aria-label="Lessons completed toward capstone eligibility"
          >
            <div
              className={`h-full transition-all duration-300 ${isReady ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {!isReady && remaining > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {remaining} more lesson{remaining === 1 ? '' : 's'} in this module unlocks submission.
            </p>
          )}
        </div>
      )}

      <Link
        href={`/capstones/${moduleSlug}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
      >
        <span>{cta}</span>
        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
      </Link>
    </section>
  )
}
