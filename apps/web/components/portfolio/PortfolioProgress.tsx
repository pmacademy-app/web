'use client'

import React from 'react'
import { BookOpen, Layers, CheckCircle2, TrendingUp } from 'lucide-react'
import type { PublicPortfolioPayload } from '@/lib/portfolio-db'

interface PortfolioProgressProps {
  progress: PublicPortfolioPayload['progress']
}

export function PortfolioProgress({ progress }: PortfolioProgressProps) {
  const {
    completedLessonsCount,
    totalLessonsCount,
    completedModulesCount,
    totalModulesCount,
    progressPercentage,
  } = progress

  return (
    <div className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-sm space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-foreground">
              Curriculum Mastery & Progress
            </h2>
            <p className="text-xs text-muted-foreground">
              Structured PM curriculum progress across 90 rigor-tested lessons.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
          <CheckCircle2 className="w-4 h-4" />
          <span>{progressPercentage}% Curriculum Complete</span>
        </div>
      </div>

      {/* Progress Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Completed Lessons */}
        <div className="rounded-xl border border-border/80 bg-card/60 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
            <BookOpen className="w-4 h-4 text-primary" />
            <span>Lessons Completed</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {completedLessonsCount} <span className="text-sm font-normal text-muted-foreground">/ {totalLessonsCount}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-2">
            <div
              className="h-full bg-primary transition-all rounded-full"
              style={{ width: `${Math.min(100, Math.round((completedLessonsCount / totalLessonsCount) * 100))}%` }}
            />
          </div>
        </div>

        {/* Modules Completed */}
        <div className="rounded-xl border border-border/80 bg-card/60 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
            <Layers className="w-4 h-4 text-primary" />
            <span>Modules Completed</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {completedModulesCount} <span className="text-sm font-normal text-muted-foreground">/ {totalModulesCount}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-2">
            <div
              className="h-full bg-emerald-500 transition-all rounded-full"
              style={{ width: `${Math.min(100, Math.round((completedModulesCount / totalModulesCount) * 100))}%` }}
            />
          </div>
        </div>

        {/* Overall Completion */}
        <div className="rounded-xl border border-border/80 bg-card/60 p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span>Total Completion</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {progressPercentage}%
          </div>
          <p className="text-[11px] text-muted-foreground leading-tight">
            Verified build-time AST lesson completions.
          </p>
        </div>
      </div>
    </div>
  )
}
