'use client'

import React from 'react'
import { Award, FolderOpen, Medal, Globe, CheckCircle2, Clock } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminOutcomesAnalytics } from '@/lib/admin/types'

interface AnalyticsOutcomesTabProps {
  data: AdminOutcomesAnalytics
}

export function AnalyticsOutcomesTab({ data }: AnalyticsOutcomesTabProps) {
  const { certificatesIssued, capstonesSubmitted, capstonesReviewed, badgesAwarded, publicPortfolios, certificateSeries } =
    data
  const hasCertData = certificateSeries.some((d) => d.count > 0)
  const pendingCapstones = Math.max(0, capstonesSubmitted - capstonesReviewed)

  return (
    <div className="space-y-6">
      {/* Outcomes KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Certificates Issued"
          value={certificatesIssued.toLocaleString()}
          subtitle="In selected range"
          icon={Award}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Capstones Submitted"
          value={capstonesSubmitted.toLocaleString()}
          subtitle="In selected range"
          icon={FolderOpen}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Badges Earned"
          value={badgesAwarded.toLocaleString()}
          subtitle="Total badges awarded all-time"
          icon={Medal}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Public Portfolios"
          value={publicPortfolios.toLocaleString()}
          subtitle="Learners with public showcase active"
          icon={Globe}
          iconColor="text-admin-info"
        />
      </div>

      {/* Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Certificate Issuance Velocity Chart */}
        <AdminSection title="Certificate Issuance" icon={Award} meta="Issued per day">
          {!hasCertData ? (
            <AdminEmptyState
              icon={Award}
              title="No certificates issued in this range"
              description="Certificates awarded upon course completion will appear here."
              className="py-10"
            />
          ) : (
            <div
              className="w-full h-64"
              role="img"
              aria-label="Daily certificate issuance chart over the selected range"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={certificateSeries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
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
                  <Bar dataKey="count" name="Certificates" fill="var(--admin-success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminSection>

        {/* Capstone Moderation & Quality Summary */}
        <AdminSection title="Capstone Project Moderation" icon={FolderOpen} meta="Review status">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-4 space-y-1">
                <div className="flex items-center gap-2 text-admin-success">
                  <CheckCircle2 className="w-4 h-4" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Reviewed / Approved</p>
                </div>
                <p className="text-2xl font-extrabold text-admin-fg">{capstonesReviewed.toLocaleString()}</p>
                <p className="text-xs text-admin-fg-muted">Evaluated and published capstones</p>
              </div>

              <div className="rounded-lg bg-admin-surface-raised border border-admin-border p-4 space-y-1">
                <div className="flex items-center gap-2 text-admin-warning">
                  <Clock className="w-4 h-4" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">Pending Review</p>
                </div>
                <p className="text-2xl font-extrabold text-admin-fg">{pendingCapstones.toLocaleString()}</p>
                <p className="text-xs text-admin-fg-muted">Awaiting administrative evaluation</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-admin-surface-raised border border-admin-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-admin-fg">Capstone Moderation Progress</span>
                <span className="font-mono font-bold text-admin-fg">
                  {capstonesSubmitted > 0 ? Math.round((capstonesReviewed / capstonesSubmitted) * 100) : 100}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-admin-surface border border-admin-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-admin-accent transition-all"
                  style={{
                    width: `${capstonesSubmitted > 0 ? (capstonesReviewed / capstonesSubmitted) * 100 : 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </AdminSection>
      </div>
    </div>
  )
}
