'use client'

import React, { useEffect } from 'react'
import { Target, Compass, Sparkles, BookOpen } from 'lucide-react'
import type { PersonalizedPath, RecommendedMilestone } from '@/lib/personalization/path-resolver'
import { trackGoalContextViewed } from '@/lib/analytics'

interface PersonalizedGoalBannerProps {
  path: PersonalizedPath
  milestone: RecommendedMilestone | null
}

export function PersonalizedGoalBanner({ path, milestone }: PersonalizedGoalBannerProps) {
  useEffect(() => {
    if (path.isPersonalized) {
      trackGoalContextViewed(path.goalId || undefined, path.recommendedModuleSlug)
    }
  }, [path.isPersonalized, path.goalId, path.recommendedModuleSlug])

  if (!path.isPersonalized) {
    return null
  }

  return (
    <div
      data-testid="personalized-goal-banner"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-5 md:p-6 shadow-sm"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          {/* Top badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/15 border border-primary/25 text-primary text-xs font-bold uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5" />
              Personalized Path
            </span>
            {path.goalBadge && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-semibold">
                <Target className="w-3 h-3" />
                {path.goalBadge}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-xs font-medium">
              <BookOpen className="w-3 h-3 text-primary" />
              Focus: {path.recommendedModule.name}
            </span>
          </div>

          {/* Goal Title / Subtitle */}
          {path.headerSubtitle && (
            <h3 className="text-lg md:text-xl font-bold font-serif text-foreground leading-snug">
              {path.headerSubtitle}
            </h3>
          )}

          {/* Context motivation */}
          <p className="text-xs md:text-sm text-muted-foreground leading-relaxed max-w-3xl">
            {path.contextMessage}
          </p>

          {/* Milestone reason */}
          {milestone && (
            <div className="flex items-start gap-2 pt-1 text-xs text-foreground/90 font-medium">
              <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{milestone.milestoneReason}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
