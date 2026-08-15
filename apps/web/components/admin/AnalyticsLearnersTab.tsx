'use client'

import React from 'react'
import { Users, Activity, Flame, Shield } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminLearnerActivityChart } from './AdminLearnerActivityChart'
import type { AdminLearnerDemographics, AdminStreakBucket, AdminLevelDistribution } from '@/lib/admin/types'

interface AnalyticsLearnersTabProps {
  data: AdminLearnerDemographics
}

/** Streak histogram bars */
function StreakBars({ buckets }: { buckets: AdminStreakBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="space-y-2.5">
      {buckets.map((b) => (
        <div key={b.bucket} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-[11px] font-semibold text-admin-fg-muted">{b.bucket}</span>
          <div className="flex-1 h-2.5 rounded-full bg-admin-surface-raised border border-admin-border overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-admin-accent to-admin-info transition-all"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-12 shrink-0 text-right text-[11px] font-mono font-bold text-admin-fg">
            {b.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Level distribution progress bars */
function LevelBars({ levels }: { levels: AdminLevelDistribution[] }) {
  return (
    <div className="space-y-3">
      {levels.map((lvl) => (
        <div key={lvl.level} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-admin-fg">{lvl.label}</span>
            <div className="flex items-center gap-2 font-mono">
              <span className="font-bold text-admin-fg">{lvl.count.toLocaleString()}</span>
              <span className="text-[10px] text-admin-fg-muted font-semibold">({lvl.percentage}%)</span>
            </div>
          </div>
          <div className="h-2 rounded-full bg-admin-surface-raised border border-admin-border overflow-hidden">
            <div
              className="h-full rounded-full bg-admin-accent transition-all"
              style={{ width: `${lvl.percentage}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function AnalyticsLearnersTab({ data }: AnalyticsLearnersTabProps) {
  return (
    <div className="space-y-6">
      {/* Trailing window snapshots */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="DAU"
          value={data.dau.toLocaleString()}
          subtitle="Active in last 24 hours"
          icon={Users}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="WAU"
          value={data.wau.toLocaleString()}
          subtitle="Active in last 7 days"
          icon={Users}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="MAU"
          value={data.mau.toLocaleString()}
          subtitle="Active in last 30 days"
          icon={Users}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Active Learners"
          value={data.activeLearners.toLocaleString()}
          subtitle="Active in selected range"
          icon={Activity}
          iconColor="text-admin-warning"
        />
      </div>

      {/* New vs Returning Learners */}
      <AdminSection title="Learner Acquisition & Retention" icon={Users} meta="Selected range">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">New Learners</p>
            <p className="text-2xl font-extrabold text-admin-fg">{data.newLearners.toLocaleString()}</p>
            <p className="text-xs text-admin-fg-muted font-mono">First XP transaction within selected range</p>
          </div>
          <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-4 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Returning Learners</p>
            <p className="text-2xl font-extrabold text-admin-fg">{data.returningLearners.toLocaleString()}</p>
            <p className="text-xs text-admin-fg-muted font-mono">Active in range with prior historical XP</p>
          </div>
        </div>
      </AdminSection>

      {/* Learner Activity Daily Chart */}
      <AdminLearnerActivityChart data={data.growthSeries} />

      {/* Distributions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSection title="Streak Distribution" icon={Flame} meta="Current user streaks">
          <StreakBars buckets={data.streakDistribution} />
        </AdminSection>
        <AdminSection title="Level Progression" icon={Shield} meta="Platform level tiers">
          <LevelBars levels={data.levelDistribution} />
        </AdminSection>
      </div>
    </div>
  )
}
