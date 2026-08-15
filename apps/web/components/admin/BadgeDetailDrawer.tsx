'use client'

import React from 'react'
import Link from 'next/link'
import { Award, Users, Target, ArrowRight } from 'lucide-react'
import { AdminDrawer } from './AdminDrawer'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminBadgeDetail } from '@/lib/admin/achievements-service'

interface BadgeDetailDrawerProps {
  badgeKey: string | null
  badge: AdminBadgeDetail | null
  isOpen: boolean
  onClose: () => void
}

export function BadgeDetailDrawer({ badgeKey, badge, isOpen, onClose }: BadgeDetailDrawerProps) {
  return (
    <AdminDrawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={badge?.name || 'Badge'}
      description={badge ? `${badge.category} badge` : undefined}
      size="md"
    >
      {badge ? (
        <div className="space-y-6">
          {/* Definition */}
          <div className="space-y-2">
            <p className="text-sm text-admin-fg leading-relaxed">{badge.description}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-admin-accent-soft text-admin-accent text-xs font-bold border border-admin-accent/25 capitalize">
                <Target className="w-3.5 h-3.5" />
                {badge.criteriaText}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-admin-surface-raised text-admin-fg-muted text-xs font-bold border border-admin-border font-mono">
                {badge.key}
              </span>
            </div>
          </div>

          {/* Award stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-admin-accent" /> Earned By
              </span>
              <p className="text-2xl font-extrabold text-admin-fg">{badge.awardCount.toLocaleString()}</p>
              <span className="text-[11px] text-admin-fg-muted">learners</span>
            </div>
            <div className="rounded-xl bg-admin-surface-raised border border-admin-border p-4 space-y-1">
              <span className="text-[11px] font-semibold text-admin-fg-muted uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-admin-info" /> Target
              </span>
              <p className="text-2xl font-extrabold text-admin-fg">{badge.targetGoal}</p>
              <span className="text-[11px] text-admin-fg-muted">per criteria</span>
            </div>
          </div>

          {/* Recent earners */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-admin-fg-muted flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Recent Earners
            </h3>
            {badge.earners.length === 0 ? (
              <AdminEmptyState
                icon={Award}
                title="No earners yet"
                description="No learners have earned this badge so far."
              />
            ) : (
              <ul className="divide-y divide-admin-border rounded-xl border border-admin-border overflow-hidden">
                {badge.earners.map((earner) => (
                  <li key={`${earner.userId}-${earner.earnedAt}`} className="flex items-center justify-between gap-3 bg-admin-surface px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-admin-fg truncate">{earner.learnerName}</p>
                      <p className="text-[11px] font-mono text-admin-fg-muted">
                        {new Date(earner.earnedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Link
                      href={`/admin/users?userId=${encodeURIComponent(earner.userId)}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-admin-surface-raised hover:bg-admin-surface-raised/80 text-admin-fg-muted hover:text-admin-fg text-[11px] font-semibold border border-admin-border transition-colors shrink-0"
                    >
                      View learner <ArrowRight className="w-3 h-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <AdminEmptyState
          icon={Award}
          title="Badge not found"
          description={badgeKey ? `No badge definition matches "${badgeKey}".` : 'Select a badge to view its details.'}
        />
      )}
    </AdminDrawer>
  )
}