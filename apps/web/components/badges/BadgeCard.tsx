'use client'

import React from 'react'
import {
  BookOpen,
  CheckCircle2,
  Compass,
  Target,
  Sparkles,
  ShieldCheck,
  Zap,
  Trophy,
  Flame,
  RotateCw,
  Award,
  Crown,
  Globe,
  GraduationCap,
  Lock,
} from 'lucide-react'
import type { BadgeProgressItem } from '@/lib/badges'
import { cn } from '@/lib/utils'

interface BadgeCardProps {
  badge: BadgeProgressItem
}

function renderBadgeIcon(iconName: string, isEarned: boolean) {
  const iconProps = { className: cn('w-5 h-5', isEarned ? 'text-primary' : 'text-muted-foreground') }

  switch (iconName) {
    case 'BookOpen':
      return <BookOpen {...iconProps} />
    case 'CheckCircle2':
      return <CheckCircle2 {...iconProps} />
    case 'Compass':
      return <Compass {...iconProps} />
    case 'Target':
      return <Target {...iconProps} />
    case 'Sparkles':
      return <Sparkles {...iconProps} />
    case 'ShieldCheck':
      return <ShieldCheck {...iconProps} />
    case 'Zap':
      return <Zap {...iconProps} />
    case 'Trophy':
      return <Trophy {...iconProps} />
    case 'Flame':
      return <Flame {...iconProps} />
    case 'RotateCw':
      return <RotateCw {...iconProps} />
    case 'Award':
      return <Award {...iconProps} />
    case 'Crown':
      return <Crown {...iconProps} />
    case 'Globe':
      return <Globe {...iconProps} />
    case 'GraduationCap':
      return <GraduationCap {...iconProps} />
    default:
      return isEarned ? <Award {...iconProps} /> : <Lock {...iconProps} />
  }
}

export function BadgeCard({ badge }: BadgeCardProps) {
  const { definition, isEarned, earnedAt, currentValue, targetValue, progressPercentage } = badge

  const formattedDate = earnedAt
    ? new Date(earnedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div
      className={cn(
        'rounded-xl border p-5 space-y-3 flex flex-col justify-between transition-all shadow-xs',
        isEarned
          ? 'border-primary/40 bg-card hover:border-primary/60 shadow-sm'
          : 'border-border/60 bg-card/40 opacity-75'
      )}
    >
      <div className="space-y-3">
        {/* Top Header: Icon & Category Tag */}
        <div className="flex items-center justify-between gap-2">
          <div
            className={cn(
              'p-2.5 rounded-xl flex items-center justify-center shrink-0',
              isEarned ? 'bg-primary/10 border border-primary/20' : 'bg-muted'
            )}
          >
            {renderBadgeIcon(definition.icon, isEarned)}
          </div>

          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border',
              isEarned
                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                : 'bg-secondary text-muted-foreground border-border'
            )}
          >
            {isEarned ? 'Unlocked' : definition.category}
          </span>
        </div>

        {/* Name & Description */}
        <div>
          <h3 className="text-sm font-bold font-serif text-foreground">{definition.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {definition.description}
          </p>
        </div>
      </div>

      {/* Footer: Earned Date or Progress Bar */}
      <div className="pt-2 border-t border-border/50">
        {isEarned ? (
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-semibold text-emerald-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Milestone Earned
            </span>
            {formattedDate && <span className="font-mono">{formattedDate}</span>}
          </div>
        ) : (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px] font-mono">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-bold text-foreground">
                {currentValue} / {targetValue}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary/70 transition-all rounded-full"
                style={{ width: `${Math.min(100, Math.max(5, progressPercentage))}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
