import React from 'react'
import {
  BookOpen,
  CheckCircle2,
  Compass,
  Zap,
  Flame,
  Trophy,
  Globe,
  GraduationCap,
  Award,
  Medal,
  type LucideIcon,
} from 'lucide-react'
import type { AdminBadgeOverview } from '@/lib/admin/achievements-aggregation'

/** Maps badge config icon names to lucide components (config stores icon as a string). */
const BADGE_ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  CheckCircle2,
  Compass,
  Zap,
  Flame,
  Trophy,
  Globe,
  GraduationCap,
  Award,
  Medal,
}

export function AdminBadgeCard({
  badge,
  onSelect,
}: {
  badge: AdminBadgeOverview
  onSelect: () => void
}) {
  const Icon = BADGE_ICON_MAP[badge.icon] || Award
  const earned = badge.awardCount > 0

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open details for ${badge.name}`}
      className="group flex flex-col gap-3 rounded-xl bg-admin-surface border border-admin-border p-5 text-left shadow-xl transition-all hover:border-admin-border-strong hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-accent/50 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`p-2.5 rounded-lg border transition-transform group-hover:scale-105 ${
            earned
              ? 'bg-admin-accent-soft border-admin-accent/25 text-admin-accent'
              : 'bg-admin-surface-raised border-admin-border text-admin-fg-subtle'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <span className="px-2 py-0.5 rounded bg-admin-surface-raised text-admin-fg-muted font-mono text-[10px] border border-admin-border capitalize">
          {badge.category}
        </span>
      </div>

      <div className="space-y-1 min-w-0">
        <h3 className="text-sm font-bold text-admin-fg truncate">{badge.name}</h3>
        <p className="text-xs text-admin-fg-muted leading-relaxed line-clamp-2">{badge.description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-2 border-t border-admin-border">
        <span className="text-[11px] font-mono text-admin-fg-subtle">{badge.criteriaText}</span>
        <span
          className={`text-xs font-bold ${
            earned ? 'text-admin-success' : 'text-admin-fg-subtle'
          }`}
        >
          {badge.awardCount.toLocaleString()} earned
        </span>
      </div>
    </button>
  )
}