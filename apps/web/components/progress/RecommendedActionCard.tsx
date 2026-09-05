import Link from 'next/link'
import { ArrowRight, CheckCircle, Compass, Target, Sparkles } from 'lucide-react'
import type { PersonalizedPath, RecommendedMilestone } from '@/lib/personalization/path-resolver'

interface RecommendedActionCardProps {
  personalizedPath: PersonalizedPath
  milestone: RecommendedMilestone | null
}

/**
 * The single "what should I do next?" banner for the Progress page. Wires in
 * the same personalization engine the Dashboard already uses
 * (`resolvePersonalizedPath` / `resolveNextRecommendedMilestone`) instead of
 * a plain "next incomplete lesson" lookup, so the reasoning is goal-aware.
 */
export function RecommendedActionCard({ personalizedPath, milestone }: RecommendedActionCardProps) {
  if (!milestone) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Curriculum Mastered 👑
            </span>
          </div>
          <h2 className="text-lg font-bold font-serif text-foreground">
            You have completed all 90 lessons!
          </h2>
          <p className="text-xs text-muted-foreground">
            All 9 modules are mastered. Complete your capstones to showcase your applied proof of work.
          </p>
        </div>
        <Link
          href="/capstones"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xs hover:bg-emerald-500 transition-all shrink-0"
        >
          <span>Open Capstones Workspace</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  const { lesson, order, milestoneReason, isTargetModuleLesson } = milestone

  return (
    <div className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-background p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
            Recommended Next Action
          </span>
          <span className="text-xs text-muted-foreground font-mono">
            Lesson {order} of 90
          </span>
          {personalizedPath.isPersonalized && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
              <Target className="w-3 h-3" />
              {personalizedPath.goalBadge || 'Personalized'}
            </span>
          )}
          {isTargetModuleLesson && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground text-[10px] font-medium">
              <Compass className="w-3 h-3 text-primary" />
              Focus: {personalizedPath.recommendedModule.name}
            </span>
          )}
        </div>
        <h2 className="text-lg font-bold font-serif text-foreground">
          {lesson.title}
        </h2>
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground max-w-2xl">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
          <span>{milestoneReason}</span>
        </div>
      </div>
      <Link
        href={`/academy/${lesson.module}/${lesson.id}`}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-xs hover:bg-primary/90 transition-all shrink-0"
      >
        <span>Continue Lesson {order}</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
