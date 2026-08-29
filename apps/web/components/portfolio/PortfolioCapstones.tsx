'use client'

import React, { useState } from 'react'
import {
  Award,
  Calendar,
  CheckCircle2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  FileText,
  Target,
  Clock,
  Link2,
  Check,
} from 'lucide-react'
import type { PublicCapstoneItem } from '@/lib/portfolio-db'

interface PortfolioCapstonesProps {
  capstones: PublicCapstoneItem[]
}

export function PortfolioCapstones({ capstones }: PortfolioCapstonesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopyLink = (capstoneId: string) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    url.hash = `project-${capstoneId}`
    navigator.clipboard.writeText(url.toString())
    setCopiedId(capstoneId)
    setTimeout(() => setCopiedId(null), 2500)
  }

  if (!capstones || capstones.length === 0) {
    return (
      <div id="capstones" className="rounded-2xl border border-border bg-card p-8 text-center space-y-3 shadow-sm scroll-mt-8">
        <Award className="w-10 h-10 text-muted-foreground/50 mx-auto" />
        <h3 className="text-base font-bold font-serif text-foreground">
          No Public Capstones Published Yet
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          Capstones submitted in the workspace will appear here when completed and set to public view.
        </p>
      </div>
    )
  }

  return (
    <div id="capstones" className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6 scroll-mt-8">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Applied Capstones &amp; Projects
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Structured product management deliverables and case studies authored during curriculum milestones.
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-primary px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 w-fit">
          {capstones.length} Applied Project{capstones.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Capstone Cards List */}
      <div className="space-y-6">
        {capstones.map((cap) => {
          const isExpanded = expandedId === cap.id
          const isCopied = copiedId === cap.id
          const formattedDate = new Date(cap.submittedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
          const readTimeMinutes = Math.max(1, Math.ceil(cap.wordCount / 200))

          return (
            <article
              key={cap.id}
              id={`project-${cap.id}`}
              className="rounded-2xl border border-border bg-card/60 p-6 md:p-7 space-y-5 hover:border-primary/40 transition-all shadow-xs scroll-mt-24"
            >
              {/* Card Header & Badges */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                    Module {String(cap.moduleNumber).padStart(2, '0')} — {cap.moduleTitle}
                  </span>
                  {cap.competencyCluster && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-secondary text-secondary-foreground border border-border">
                      {cap.competencyCluster}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                    <Calendar className="w-3 h-3" /> {formattedDate}
                  </span>
                </div>

                <div className="flex items-center gap-3 self-start sm:self-auto">
                  {cap.status === 'reviewed' ? (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[11px] font-semibold text-emerald-500 border border-emerald-500/20">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Reviewed by Prodily</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-muted/60 text-[11px] font-medium text-muted-foreground border border-border/50">
                      <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                      <span>Submitted to Prodily</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleCopyLink(cap.id)}
                    aria-label={`Copy direct link to ${cap.title}`}
                    title="Copy direct link to this project"
                    className="p-1.5 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                  >
                    {isCopied ? (
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

              {/* Title & Deliverable Metadata */}
              <div className="space-y-2">
                <h3 className="text-lg md:text-xl font-bold font-serif text-foreground leading-snug">
                  {cap.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>{cap.deliverableType}</span>
                  </span>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span>~{readTimeMinutes} min read ({cap.wordCount} words)</span>
                  </span>
                </div>
              </div>

              {/* Learning Objectives / Skills Demonstrated */}
              {cap.learningObjectives && cap.learningObjectives.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground block">
                    Product Judgment Skills Demonstrated:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {cap.learningObjectives.map((obj, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] bg-secondary/70 text-secondary-foreground border border-border/60 leading-tight"
                      >
                        <Target className="w-3 h-3 text-primary/80 shrink-0" />
                        <span>{obj}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Deliverable Content Presentation */}
              <div className="space-y-2">
                <div className="text-xs md:text-sm text-foreground/90 leading-relaxed font-serif bg-background/60 p-4 md:p-5 rounded-xl border border-border/60">
                  {isExpanded ? (
                    <div className="whitespace-pre-line space-y-3">{cap.content}</div>
                  ) : (
                    <div className="line-clamp-4 whitespace-pre-line">{cap.content}</div>
                  )}
                </div>

                {/* Expand / Collapse Control */}
                {cap.content.length > 220 && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : cap.id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline pt-0.5 cursor-pointer"
                  >
                    <span>{isExpanded ? 'Collapse Deliverable' : `Read Full ${cap.deliverableType} (${cap.wordCount} words)`}</span>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              {/* Attached Public Reflection */}
              {cap.reflection && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Candidate Reflection &amp; Learning Synthesis</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed italic">
                    &ldquo;{cap.reflection.content}&rdquo;
                  </p>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

