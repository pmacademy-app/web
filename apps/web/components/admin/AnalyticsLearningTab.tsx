'use client'

import React from 'react'
import { BookOpen, GraduationCap, TrendingUp, HelpCircle } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminLearningActivityChart } from './AdminLearningActivityChart'
import type { AdminLearningDeepAnalytics } from '@/lib/admin/types'


interface AnalyticsLearningTabProps {
  data: AdminLearningDeepAnalytics
}

export function AnalyticsLearningTab({ data }: AnalyticsLearningTabProps) {
  const { totalLessonsCompleted, courseCompletionPct, moduleCompletionPct, quizStats, moduleDropOffs, learningSeries } =
    data

  return (
    <div className="space-y-6">
      {/* Learning KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Lessons Completed"
          value={totalLessonsCompleted.toLocaleString()}
          subtitle="In selected range"
          icon={BookOpen}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Module Completion"
          value={`${moduleCompletionPct.toFixed(1)}%`}
          subtitle="Average across all modules"
          icon={TrendingUp}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Course Completion"
          value={`${courseCompletionPct.toFixed(1)}%`}
          subtitle="All registered learners"
          icon={GraduationCap}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Quiz Pass Rate"
          value={`${quizStats.passRatePct.toFixed(1)}%`}
          subtitle={`${quizStats.passedAttempts.toLocaleString()} of ${quizStats.totalAttempts.toLocaleString()} attempts passed`}
          icon={HelpCircle}
          iconColor="text-admin-info"
        />
      </div>

      {/* Module Progression & Drop-Off Analysis */}
      <AdminSection
        title="Curriculum Drop-Off & Module Completion"
        icon={BookOpen}
        meta="Sequential module progression"
      >
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-admin-border text-admin-fg-muted font-semibold">
                  <th className="pb-2 pl-1">Module</th>
                  <th className="pb-2 text-right">Lessons</th>
                  <th className="pb-2 text-right">Learners Started</th>
                  <th className="pb-2 text-right">Completed</th>
                  <th className="pb-2 text-right">Completion Rate</th>
                  <th className="pb-2 pr-1 text-right">Drop-Off</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-border/50 font-mono">
                {moduleDropOffs.map((mod) => (
                  <tr key={mod.slug} className="hover:bg-admin-surface-raised/40 transition-colors">
                    <td className="py-3 pl-1 font-sans font-semibold text-admin-fg">
                      <div className="flex items-center gap-2">
                        <span className="w-5 text-center text-admin-fg-muted font-mono">{mod.order}.</span>
                        <span>{mod.title}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right text-admin-fg-muted">{mod.lessonCount}</td>
                    <td className="py-3 text-right text-admin-fg font-bold">{mod.learnersStarted.toLocaleString()}</td>
                    <td className="py-3 text-right text-admin-fg font-bold">
                      {mod.learnersCompleted.toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <span className="text-admin-success font-bold">{mod.completionPct}%</span>
                        <div className="w-16 h-1.5 rounded-full bg-admin-surface-raised overflow-hidden">
                          <div
                            className="h-full bg-admin-success rounded-full"
                            style={{ width: `${mod.completionPct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-1 text-right">
                      <span className={mod.dropOffPct > 30 ? 'text-admin-danger font-bold' : 'text-admin-fg-muted'}>
                        {mod.dropOffPct > 0 ? `-${mod.dropOffPct}%` : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </AdminSection>

      {/* Quiz Performance Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSection title="Quiz Performance" icon={HelpCircle} meta="Selected range">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Average Score</p>
                <p className="mt-1 text-xl font-extrabold text-admin-fg">
                  {quizStats.avgScorePct !== null ? `${quizStats.avgScorePct.toFixed(1)}%` : '—'}
                </p>
              </div>
              <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-admin-fg-subtle">Total Attempts</p>
                <p className="mt-1 text-xl font-extrabold text-admin-fg">{quizStats.totalAttempts.toLocaleString()}</p>
              </div>
            </div>

            {/* Score Buckets */}
            <div className="space-y-2 pt-2">
              <p className="text-xs font-semibold text-admin-fg-muted">Score Distribution</p>
              {quizStats.scoreDistribution.map((bucket) => {
                const max = Math.max(1, ...quizStats.scoreDistribution.map((b) => b.count))
                return (
                  <div key={bucket.range} className="flex items-center gap-3 text-xs">
                    <span className="w-20 text-admin-fg-muted font-mono">{bucket.range}</span>
                    <div className="flex-1 h-2 rounded-full bg-admin-surface-raised border border-admin-border overflow-hidden">
                      <div
                        className="h-full bg-admin-info rounded-full transition-all"
                        style={{ width: `${(bucket.count / max) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono font-bold text-admin-fg">{bucket.count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </AdminSection>

        {/* Learning Activity Chart */}
        <AdminLearningActivityChart data={learningSeries} />
      </div>
    </div>
  )
}
