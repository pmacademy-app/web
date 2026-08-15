'use client'

import React from 'react'
import { Zap } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminXpSourceDistribution } from '@/lib/admin/types'

interface AnalyticsXpSourceChartProps {
  data: AdminXpSourceDistribution[]
}

const SOURCE_COLORS: Record<string, string> = {
  lesson: 'bg-admin-accent',
  quiz: 'bg-admin-info',
  streak: 'bg-admin-warning',
  flashcard: 'bg-admin-success',
  reflection: 'bg-purple-500',
  capstone: 'bg-amber-500',
  bonus: 'bg-emerald-500',
  other: 'bg-admin-fg-subtle',
}

export function AnalyticsXpSourceChart({ data }: AnalyticsXpSourceChartProps) {
  const hasData = data.some((d) => d.xp > 0)

  return (
    <AdminSection title="XP by Source" icon={Zap} meta="Activity breakdown">
      {!hasData ? (
        <AdminEmptyState
          icon={Zap}
          title="No XP activity in this range"
          description="XP earned from lessons, quizzes, flashcards, and streaks will appear here once learners make progress."
          className="py-10"
        />
      ) : (
        <div className="space-y-4">
          {/* Stacked bar visualization */}
          <div
            className="h-3 w-full rounded-full bg-admin-surface-raised border border-admin-border overflow-hidden flex"
            role="progressbar"
            aria-label="XP distribution by activity source"
          >
            {data.map((item) => {
              if (item.percentage <= 0) return null
              const colorClass = SOURCE_COLORS[item.source] || 'bg-admin-accent'
              return (
                <div
                  key={item.source}
                  className={`h-full ${colorClass} transition-all`}
                  style={{ width: `${item.percentage}%` }}
                  title={`${item.label}: ${item.xp.toLocaleString()} XP (${item.percentage}%)`}
                />
              )
            })}
          </div>

          {/* Detailed item list */}
          <div className="space-y-2.5 pt-2">
            {data.map((item) => {
              const colorClass = SOURCE_COLORS[item.source] || 'bg-admin-accent'
              return (
                <div key={item.source} className="flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorClass}`} />
                    <span className="font-semibold text-admin-fg truncate">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono">
                    <span className="font-bold text-admin-fg">{item.xp.toLocaleString()} XP</span>
                    <span className="w-12 text-right text-admin-fg-muted text-[11px] font-semibold">
                      {item.percentage}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </AdminSection>
  )
}
