import React, { Suspense } from 'react'
import {
  Users,
  Flame,
  Zap,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Award,
  FolderOpen,
  TrendingUp,
  Activity,
  AlertTriangle,
} from 'lucide-react'
import { CurriculumService } from '@/lib/admin/curriculum-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminRangeSelector } from '@/components/admin/AdminRangeSelector'
import { AdminKpiCard } from '@/components/admin/AdminKpiCard'
import { AdminSection } from '@/components/admin/AdminSection'
import { AdminProgressBar } from '@/components/admin/AdminProgressBar'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { AdminRetryButton } from '@/components/admin/AdminRetryButton'
import { AdminLearnerActivityChart } from '@/components/admin/AdminLearnerActivityChart'
import { AdminLearningActivityChart } from '@/components/admin/AdminLearningActivityChart'
import type { AdminDateRangeKey, AdminLearningAnalytics, AdminStreakBucket } from '@/lib/admin/types'

export const revalidate = 0

interface AdminAnalyticsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/** Horizontal histogram for the streak-distribution buckets. */
function StreakBars({ buckets }: { buckets: AdminStreakBucket[] }) {
  const max = Math.max(1, ...buckets.map((b) => b.count))
  return (
    <div className="space-y-2.5">
      {buckets.map((b) => (
        <div key={b.bucket} className="flex items-center gap-3">
          <span className="w-20 shrink-0 text-[11px] font-semibold text-admin-fg-muted">{b.bucket}</span>
          <div className="flex-1 h-2 rounded-full bg-admin-surface-raised border border-admin-border overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-admin-accent to-admin-info transition-all"
              style={{ width: `${(b.count / max) * 100}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[11px] font-mono font-bold text-admin-fg-subtle">
            {b.count}
          </span>
        </div>
      ))}
    </div>
  )
}

function EngagementStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-admin-fg">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] font-mono text-admin-fg-muted">{sub}</p>}
    </div>
  )
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const params = await searchParams
  const range = (params.range as AdminDateRangeKey) || '30d'
  const from = typeof params.from === 'string' ? params.from : null
  const to = typeof params.to === 'string' ? params.to : null

  let data: AdminLearningAnalytics | null = null
  let failed = false
  try {
    data = await CurriculumService.getLearningAnalytics(range, from, to)
  } catch (err) {
    console.error('[AdminAnalyticsPage] Failed to load learning analytics:', err)
    failed = true
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Learning Analytics"
        description="Learner, engagement and outcome metrics across the curriculum."
        icon={Activity}
        actions={
          <Suspense fallback={<div className="h-9 w-56 rounded-lg bg-admin-surface border border-admin-border" />}>
            <AdminRangeSelector />
          </Suspense>
        }
      />

      {failed || !data ? (
        <AdminEmptyState
          icon={AlertTriangle}
          title="Unable to load analytics"
          description="Something went wrong while loading the learning analytics. Try again, or check that the database is reachable."
          action={<AdminRetryButton />}
        />
      ) : (
        <AnalyticsContent data={data} />
      )}
    </div>
  )
}

function AnalyticsContent({ data }: { data: AdminLearningAnalytics }) {
  const { learners, learning, engagement, outcomes } = data

  return (
    <>
      {/* Learners — DAU/WAU/MAU are trailing-window snapshots, not range-scoped */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="DAU"
          value={learners.dau.toLocaleString()}
          subtitle="Active in last 24h"
          icon={Users}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="WAU"
          value={learners.wau.toLocaleString()}
          subtitle="Active in last 7 days"
          icon={Users}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="MAU"
          value={learners.mau.toLocaleString()}
          subtitle="Active in last 30 days"
          icon={Users}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Active Learners"
          value={learners.activeLearners.toLocaleString()}
          subtitle="Earned XP in selected range"
          icon={Activity}
          iconColor="text-admin-warning"
        />
      </div>

      {/* New vs returning (spec §4.7 Learners) */}
      <AdminSection title="New vs Returning" icon={Users} meta="Selected range">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EngagementStat label="New Learners" value={learners.newLearners.toLocaleString()} sub="First XP in range" />
          <EngagementStat
            label="Returning Learners"
            value={learners.returningLearners.toLocaleString()}
            sub="Active before range"
          />
        </div>
      </AdminSection>

      {/* Engagement */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSection title="Streak Distribution" icon={Flame} meta="Current streaks">
          <StreakBars buckets={engagement.streakDistribution} />
        </AdminSection>
        <AdminSection title="Engagement" icon={Zap} meta="Mixed windows">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <EngagementStat label="XP Earned" value={engagement.xpEarned.toLocaleString()} sub="In selected range" />
            <EngagementStat label="SRS Reviews" value={engagement.srsReviews.toLocaleString()} sub="All-time" />
            <EngagementStat
              label="Active Flashcard Learners"
              value={engagement.activeFlashcardLearners.toLocaleString()}
              sub="All-time"
            />
          </div>
        </AdminSection>
      </div>

      {/* Learning */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Lessons Completed"
          value={learning.lessonsCompleted.toLocaleString()}
          subtitle="In selected range"
          icon={BookOpen}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Module Completion"
          value={`${learning.moduleCompletionPct.toFixed(1)}%`}
          subtitle="Avg across learners with progress"
          icon={TrendingUp}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Course Completion"
          value={`${learning.courseCompletionPct.toFixed(1)}%`}
          subtitle="Of all registered learners"
          icon={GraduationCap}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Quiz Avg Score"
          value={learning.quizAvgScore === null ? '—' : `${learning.quizAvgScore.toFixed(1)}%`}
          subtitle={`${learning.quizAttempts.toLocaleString()} attempts in range`}
          icon={HelpCircle}
          iconColor="text-admin-info"
        />
      </div>

      {/* Per-module completion */}
      <AdminSection title="Module Completion" icon={BookOpen} meta="Avg across learners">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
          {learning.modules.map((m) => (
            <AdminProgressBar key={m.slug} value={m.completedPct} label={m.title} />
          ))}
        </div>
      </AdminSection>

      {/* Outcomes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminKpiCard
          title="Certificates Issued"
          value={outcomes.certificatesIssued.toLocaleString()}
          subtitle="In selected range"
          icon={Award}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Capstones Submitted"
          value={outcomes.capstonesSubmitted.toLocaleString()}
          subtitle="In selected range"
          icon={FolderOpen}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Public Portfolios"
          value={outcomes.publicPortfolios.toLocaleString()}
          subtitle="All-time"
          icon={Users}
          iconColor="text-admin-info"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminLearnerActivityChart data={data.series} />
        <AdminLearningActivityChart data={data.series} />
      </div>
    </>
  )
}
