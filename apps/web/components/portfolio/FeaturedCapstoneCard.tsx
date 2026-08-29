'use client'

import React, { useState } from 'react'
import type { PublicCapstoneItem } from '@/lib/portfolio-db'
import {
  Sparkles,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Target,
  FileText,
  Quote,
  Calendar,
  Clock,
  Link2,
  Check,
} from 'lucide-react'

interface FeaturedCapstoneCardProps {
  capstone: PublicCapstoneItem
}

export function FeaturedCapstoneCard({ capstone }: FeaturedCapstoneCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyLink = () => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.hash = `featured-project-${capstone.id}`
    navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const formattedDate = new Date(capstone.submittedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const readTimeMinutes = Math.max(1, Math.ceil(capstone.wordCount / 200))

  return (
    <section
      id={`featured-project-${capstone.id}`}
      aria-label="Featured Applied Project"
      className="relative rounded-2xl border-2 border-primary/40 bg-card/80 p-6 md:p-8 backdrop-blur-xs shadow-lg space-y-6 overflow-hidden transition-all scroll-mt-24"
    >
      {/* Ambient background glow */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 relative z-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 text-xs font-bold uppercase tracking-wider shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
            Featured Artifact
          </span>

          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-muted-foreground px-2.5 py-0.5 rounded bg-muted/60">
            Module {capstone.moduleNumber.toString().padStart(2, '0')} — {capstone.moduleTitle}
          </span>

          {capstone.competencyCluster && (
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {capstone.competencyCluster}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
            <Calendar className="w-3.5 h-3.5" />
            <span>{formattedDate}</span>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy direct link to featured project"
            title="Copy direct link to this project"
            className="p-1.5 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-bold hidden sm:inline">Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Share</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Title & Metadata */}
      <div className="space-y-2 relative z-10">
        <h2 className="text-xl md:text-2xl font-bold font-serif text-foreground leading-snug">
          {capstone.title}
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-semibold text-foreground">
            <FileText className="w-3.5 h-3.5 text-primary" />
            {capstone.deliverableType}
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px]">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>~{readTimeMinutes} min read ({capstone.wordCount} words)</span>
          </span>
          <span>•</span>
          {capstone.status === 'reviewed' ? (
            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Reviewed by Prodily
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/60" />
              Submitted to Prodily
            </span>
          )}
        </div>
      </div>

      {/* Learning Objectives Chips */}
      {capstone.learningObjectives && capstone.learningObjectives.length > 0 && (
        <div className="space-y-1.5 relative z-10">
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground block">
            Core PM Judgment Skills Evaluated:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {capstone.learningObjectives.map((obj, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg bg-secondary/80 text-secondary-foreground border border-border/60"
              >
                <Target className="w-3 h-3 text-primary shrink-0" />
                <span>{obj}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Deliverable Content */}
      <div className="relative z-10 space-y-2">
        <div
          className={`text-sm text-foreground/90 font-serif leading-relaxed whitespace-pre-line rounded-xl bg-background/50 p-5 border border-border/60 transition-all ${
            isExpanded ? '' : 'max-h-52 overflow-hidden relative'
          }`}
        >
          {capstone.content}

          {!isExpanded && (
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 rounded px-1 cursor-pointer"
        >
          {isExpanded ? (
            <>
              <span>Collapse artifact preview</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>Read complete deliverable ({capstone.wordCount} words)</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Attached Reflection Quote if public */}
      {capstone.reflection && (
        <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs space-y-2 relative z-10">
          <div className="flex items-center gap-1.5 font-bold text-primary">
            <Quote className="w-3.5 h-3.5" />
            <span>Learner Retrospective &amp; Reflection</span>
          </div>
          <p className="italic text-muted-foreground leading-relaxed">
            &ldquo;{capstone.reflection.content}&rdquo;
          </p>
        </div>
      )}
    </section>
  )
}
