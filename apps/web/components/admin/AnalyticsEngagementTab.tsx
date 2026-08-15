'use client'

import React from 'react'
import { Zap, Flame, Brain, BookOpen } from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import { AnalyticsXpSourceChart } from './AnalyticsXpSourceChart'
import type { AdminEngagementAnalytics } from '@/lib/admin/types'

interface AnalyticsEngagementTabProps {
  data: AdminEngagementAnalytics
}

export function AnalyticsEngagementTab({ data }: AnalyticsEngagementTabProps) {
  const { streakDistribution, xpEarned, xpBySource, srsReviews, activeFlashcardLearners, dailyXpSeries } = data
  const hasXpData = dailyXpSeries.some((d) => d.xp > 0)

  return (
    <div className="space-y-6">
      {/* Engagement KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="XP Earned"
          value={xpEarned.toLocaleString()}
          subtitle="In selected range"
          icon={Zap}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Flashcard Reviews"
          value={srsReviews.toLocaleString()}
          subtitle="All-time SRS review events"
          icon={Brain}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="SRS Active Learners"
          value={activeFlashcardLearners.toLocaleString()}
          subtitle="Learners with active flashcard decks"
          icon={BookOpen}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="Habit Consistency"
          value={`${streakDistribution.filter((b) => b.bucket !== '0 days').reduce((sum, b) => sum + b.count, 0).toLocaleString()}`}
          subtitle="Learners maintaining active streaks"
          icon={Flame}
          iconColor="text-admin-danger"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily XP Velocity Chart */}
        <AdminSection title="Daily XP Velocity" icon={Zap} meta="XP earned per day">
          {!hasXpData ? (
            <AdminEmptyState
              icon={Zap}
              title="No XP recorded in this range"
              description="Daily XP earnings from lessons, quizzes, flashcards, and streaks will appear here."
              className="py-10"
            />
          ) : (
            <div
              className="w-full h-64"
              role="img"
              aria-label="Daily XP velocity chart over the selected range"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyXpSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradXp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--admin-warning)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--admin-warning)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--admin-fg-muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--admin-border)' }}
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fill: 'var(--admin-fg-muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--admin-surface-raised)',
                      border: '1px solid var(--admin-border)',
                      borderRadius: 8,
                      fontSize: 12,
                      color: 'var(--admin-fg)',
                    }}
                    labelStyle={{ color: 'var(--admin-fg-muted)', fontWeight: 600 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="xp"
                    name="XP Earned"
                    stroke="var(--admin-warning)"
                    fill="url(#gradXp)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminSection>

        {/* XP Source Breakdown */}
        <AnalyticsXpSourceChart data={xpBySource} />
      </div>
    </div>
  )
}
