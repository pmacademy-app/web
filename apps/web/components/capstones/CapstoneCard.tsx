'use client'

import React from 'react'
import Link from 'next/link'
import { Award, Lock, CheckCircle, Clock, ChevronRight, Edit3 } from 'lucide-react'
import type { ModuleCapstoneOverviewItem } from '@/lib/capstones-db'
import { cn } from '@/lib/utils'

interface CapstoneCardProps {
  item: ModuleCapstoneOverviewItem
}

export function CapstoneCard({ item }: CapstoneCardProps) {
  const {
    moduleSlug,
    moduleNumber,
    moduleTitle,
    capstoneTitle,
    deliverableType,
    estimatedHours,
    status,
    unlocked,
    lessonsCompleted,
    requiredLessons,
  } = item

  const remaining = Math.max(0, requiredLessons - lessonsCompleted)

  const getStatusBadge = () => {
    switch (status) {
      case 'submitted':
      case 'reviewed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" /> Submitted
          </span>
        )
      case 'draft':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Edit3 className="w-3 h-3" /> Draft Saved
          </span>
        )
      case 'unlocked':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            Ready to Start
          </span>
        )
      case 'locked':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            <Lock className="w-3 h-3" /> Locked
          </span>
        )
    }
  }

  const getCtaText = () => {
    switch (status) {
      case 'submitted':
      case 'reviewed':
        return 'View Deliverable'
      case 'draft':
        return 'Continue Draft'
      case 'unlocked':
        return 'Open Workspace'
      case 'locked':
      default:
        return 'Locked'
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-card p-6 flex flex-col justify-between space-y-5 transition-all shadow-sm',
        unlocked
          ? 'hover:border-primary/50 hover:shadow-md border-border'
          : 'opacity-70 border-border/60 bg-card/40'
      )}
    >
      <div className="space-y-3">
        {/* Module Header & Status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
              Module {String(moduleNumber).padStart(2, '0')}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1">
              <Clock className="w-3 h-3" /> {estimatedHours}
            </span>
          </div>

          {getStatusBadge()}
        </div>

        {/* Capstone Title & Module Subtitle */}
        <div>
          <h3 className="text-base font-bold font-serif text-foreground leading-snug">
            {capstoneTitle}
          </h3>
          <p className="text-xs text-muted-foreground font-medium mt-1">{moduleTitle}</p>
        </div>

        {/* Deliverable Tag */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary/50 text-[11px] font-medium text-foreground">
          <Award className="w-3.5 h-3.5 text-primary" />
          <span>Deliverable: {deliverableType}</span>
        </div>
      </div>

      {/* Footer CTA Button */}
      <div className="pt-2">
        {unlocked ? (
          <Link
            href={`/capstones/${moduleSlug}`}
            className={cn(
              'inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm',
              status === 'submitted' || status === 'reviewed'
                ? 'bg-secondary text-foreground hover:bg-secondary/80 border border-border'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            <span>{getCtaText()}</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        ) : (
          <div className="space-y-2">
            <div
              className="w-full h-1.5 rounded-full bg-secondary overflow-hidden"
              role="progressbar"
              aria-valuenow={lessonsCompleted}
              aria-valuemin={0}
              aria-valuemax={requiredLessons}
              aria-label={`${lessonsCompleted} of ${requiredLessons} required lessons completed`}
            >
              <div
                className="h-full bg-primary/60 transition-all"
                style={{ width: `${Math.min(100, Math.round((lessonsCompleted / Math.max(1, requiredLessons)) * 100))}%` }}
              />
            </div>
            <Link
              href={`/capstones/${moduleSlug}`}
              className="inline-flex items-center justify-between w-full px-4 py-2.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors border border-border/50"
            >
              <span>
                {remaining > 0
                  ? `Preview · ${remaining} lesson${remaining === 1 ? '' : 's'} to unlock`
                  : 'Preview capstone'}
              </span>
              <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
