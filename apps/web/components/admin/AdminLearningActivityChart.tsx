'use client'

import React, { useState } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import { useIsMounted } from '@/lib/admin/use-is-mounted'
import type { AdminTimeSeriesPoint } from '@/lib/admin/types'

interface AdminLearningActivityChartProps {
  data: AdminTimeSeriesPoint[]
}

type MetricKey = 'all' | 'lessons' | 'quizzes' | 'capstones'

const METRICS: Array<{ key: MetricKey; label: string; bars: Array<keyof AdminTimeSeriesPoint> }> = [
  { key: 'all', label: 'All', bars: ['lessonsCompleted', 'quizAttempts', 'capstonesSubmitted'] },
  { key: 'lessons', label: 'Lessons', bars: ['lessonsCompleted'] },
  { key: 'quizzes', label: 'Quizzes', bars: ['quizAttempts'] },
  { key: 'capstones', label: 'Capstones', bars: ['capstonesSubmitted'] },
]

const BAR_CONFIG: Record<string, { name: string; fill: string }> = {
  lessonsCompleted: { name: 'Lessons', fill: 'var(--admin-accent)' },
  quizAttempts: { name: 'Quizzes', fill: 'var(--admin-info)' },
  capstonesSubmitted: { name: 'Capstones', fill: 'var(--admin-success)' },
}

export function AdminLearningActivityChart({ data }: AdminLearningActivityChartProps) {
  const mounted = useIsMounted()
  const [metric, setMetric] = useState<MetricKey>('all')
  const active = METRICS.find((m) => m.key === metric) || METRICS[0]

  const hasData = data.some((d) => d.lessonsCompleted > 0 || d.quizAttempts > 0 || d.capstonesSubmitted > 0)

  return (
    <AdminSection
      title="Learning Activity"
      icon={BookOpen}
      meta="Daily"
      bodyClassName="space-y-3"
    >
      <div className="flex items-center gap-1 p-1 rounded-lg bg-admin-bg/60 border border-admin-border w-fit">
        {METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMetric(m.key)}
            aria-pressed={metric === m.key}
            className={cn(
              'px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer',
              metric === m.key
                ? 'bg-admin-accent text-admin-accent-contrast'
                : 'text-admin-fg-muted hover:text-admin-fg hover:bg-admin-surface-raised'
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <AdminEmptyState
          icon={BookOpen}
          title="No learning activity in this range"
          description="Lessons, quizzes and capstone submissions will appear here once learners engage with the curriculum."
          className="py-10"
        />
      ) : (
        <div
          className="w-full h-64"
          role="img"
          aria-label="Daily learning activity chart showing lessons, quizzes and capstone submissions over the selected range"
        >
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
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
                  cursor={{ fill: 'var(--admin-accent-soft)' }}
                  contentStyle={{
                    background: 'var(--admin-surface-raised)',
                    border: '1px solid var(--admin-border)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: 'var(--admin-fg)',
                  }}
                  labelStyle={{ color: 'var(--admin-fg-muted)', fontWeight: 600 }}
                />
                {metric === 'all' && <Legend wrapperStyle={{ fontSize: 12, color: 'var(--admin-fg-muted)' }} />}
                {active.bars.map((bar) => (
                  <Bar
                    key={bar}
                    dataKey={bar}
                    name={BAR_CONFIG[bar].name}
                    fill={BAR_CONFIG[bar].fill}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full rounded-xl bg-admin-surface/20 animate-pulse" />
          )}
        </div>
      )}
    </AdminSection>
  )
}