'use client'

import React, { useState } from 'react'
import { Award, Calendar, CheckCircle2, MessageSquare, ChevronDown, ChevronUp, FileText, Target } from 'lucide-react'
import type { PublicCapstoneItem } from '@/lib/portfolio-db'

interface PortfolioCapstonesProps {
  capstones: PublicCapstoneItem[]
}

export function PortfolioCapstones({ capstones }: PortfolioCapstonesProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

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
              Verified Applied Capstones
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Production-grade product deliverables authored during module milestones.
            </p>
          </div>
        </div>

        <span className="text-xs font-bold text-emerald-500 px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 w-fit">
          {capstones.length} Verified Deliverable{capstones.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Capstone Cards List */}
      <div className="space-y-5">
        {capstones.map((cap) => {
          const isExpanded = expandedId === cap.id
          const formattedDate = new Date(cap.submittedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })

          return (
            <div
              key={cap.id}
              className="rounded-xl border border-border bg-card/60 p-6 space-y-4 hover:border-primary/40 transition-colors shadow-xs"
            >
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-3">
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

                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Verified Proof-of-Work</span>
                </div>
              </div>

              {/* Title & Metadata Pills */}
              <div className="space-y-1.5">
                <h3 className="text-lg font-bold font-serif text-foreground">
                  {cap.title}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{cap.deliverableType}</span>
                  </span>
                  {cap.wordCount > 0 && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {cap.wordCount} words
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Learning Objectives / Competencies Covered */}
              {cap.learningObjectives && cap.learningObjectives.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {cap.learningObjectives.map((obj, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] bg-muted/60 text-muted-foreground border border-border/50 leading-tight"
                    >
                      <Target className="w-3 h-3 text-primary/70 shrink-0" />
                      <span>{obj}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Content Preview / Full Text */}
              <div className="text-xs md:text-sm text-foreground/85 leading-relaxed font-sans bg-background/60 p-4 rounded-xl border border-border/60">
                {isExpanded ? (
                  <div className="whitespace-pre-wrap">{cap.content}</div>
                ) : (
                  <p className="line-clamp-4 whitespace-pre-wrap">{cap.content}</p>
                )}
              </div>

              {/* Toggle Expand Button */}
              {cap.content.length > 250 && (
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : cap.id)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline pt-0.5"
                >
                  <span>{isExpanded ? 'Show Less' : 'Read Full Deliverable'}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}

              {/* Attached Public Reflection */}
              {cap.reflection && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 font-bold text-primary">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Author Reflection & Learning Synthesis</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed italic">
                    &ldquo;{cap.reflection.content}&rdquo;
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
