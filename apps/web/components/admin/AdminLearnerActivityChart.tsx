'use client'

import React from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Users } from 'lucide-react'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminTimeSeriesPoint } from '@/lib/admin/types'

interface AdminLearnerActivityChartProps {
  data: AdminTimeSeriesPoint[]
}

export function AdminLearnerActivityChart({ data }: AdminLearnerActivityChartProps) {
  const hasData = data.some((d) => d.activeLearners > 0 || d.newUsers > 0 || d.returningLearners > 0)

  return (
    <AdminSection
      title="Learner Activity"
      icon={Users}
      meta="Daily"
      bodyClassName="space-y-0"
    >
      {!hasData ? (
        <AdminEmptyState
          icon={Users}
          title="No learner activity in this range"
          description="New, active and returning learner counts will appear here once learners engage with the curriculum."
          className="py-10"
        />
      ) : (
        <div
          className="w-full h-64"
          role="img"
          aria-label="Daily learner activity chart showing new, active and returning learners over the selected range"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gradActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--admin-accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--admin-accent)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--admin-info)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--admin-info)" stopOpacity={0} />
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
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--admin-fg-muted)' }} />
              <Area
                type="monotone"
                dataKey="activeLearners"
                name="Active Learners"
                stroke="var(--admin-accent)"
                fill="url(#gradActive)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="newUsers"
                name="New Users"
                stroke="var(--admin-info)"
                fill="url(#gradNew)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="returningLearners"
                name="Returning"
                stroke="var(--admin-warning)"
                fill="transparent"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AdminSection>
  )
}