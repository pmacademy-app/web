'use client'

import React from 'react'
import Link from 'next/link'
import { Award, Medal, FileBadge, ShieldCheck, ArrowRight, AlertTriangle } from 'lucide-react'
import { AdminPageShell } from './AdminPageShell'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminLoadWarning } from './AdminLoadWarning'
import type { AdminAchievementsOverviewKpis } from '@/lib/admin/achievements-aggregation'

interface AchievementsWorkspaceProps {
  kpis: AdminAchievementsOverviewKpis
  loadFailed: boolean
}

const NAV_TILES = [
  {
    href: '/admin/achievements/badges',
    title: 'Badges',
    description: 'Browse badge definitions, award counts and recent earners.',
    icon: Medal,
    iconColor: 'text-admin-accent',
  },
  {
    href: '/admin/achievements/certificates',
    title: 'Certificates',
    description: 'Audit issued credentials, learner attribution and verification links.',
    icon: FileBadge,
    iconColor: 'text-admin-info',
  },
  {
    href: '/admin/moderation?tab=capstones',
    title: 'Capstones',
    description: 'Review submitted capstone projects and publish to learner portfolios.',
    icon: ShieldCheck,
    iconColor: 'text-admin-success',
  },
  {
    href: '/admin/moderation?tab=portfolios',
    title: 'Portfolios',
    description: 'Browse public learner portfolios and their visibility settings.',
    icon: Award,
    iconColor: 'text-admin-warning',
  },
]

export function AchievementsWorkspace({ kpis, loadFailed }: AchievementsWorkspaceProps) {
  return (
    <AdminPageShell
      title="Achievements"
      description="Badge definitions, issued certificates and learner achievement context."
      icon={Award}
      kpis={
        <>
          <AdminKpiCard
            title="Badges Defined"
            value={kpis.badgesDefined.toLocaleString()}
            subtitle="Configured badge definitions"
            icon={Medal}
            iconColor="text-admin-accent"
          />
          <AdminKpiCard
            title="Badges Awarded"
            value={kpis.badgesAwarded.toLocaleString()}
            subtitle="Total badges earned by learners"
            icon={Award}
            iconColor="text-admin-success"
          />
          <AdminKpiCard
            title="Certificates Issued"
            value={kpis.certificatesIssued.toLocaleString()}
            subtitle={`${kpis.certificatesThisMonth.toLocaleString()} this month`}
            icon={FileBadge}
            iconColor="text-admin-info"
          />
          <AdminKpiCard
            title="Pending Capstones"
            value={kpis.pendingCapstones.toLocaleString()}
            subtitle="Awaiting moderation review"
            icon={ShieldCheck}
            iconColor="text-admin-warning"
          />
        </>
      }
    >
      {loadFailed && (
        <AdminLoadWarning message="Live achievement counts could not be loaded. Showing cached or empty values." />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NAV_TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <Link
              key={tile.href}
              href={tile.href}
              className="group flex items-start gap-4 rounded-xl bg-admin-surface border border-admin-border p-5 shadow-xl transition-all hover:border-admin-border-strong hover:shadow-2xl"
            >
              <div className="p-2.5 rounded-lg bg-admin-surface-raised border border-admin-border group-hover:scale-105 transition-transform">
                <Icon className={`w-5 h-5 ${tile.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="text-sm font-bold text-admin-fg">{tile.title}</h3>
                <p className="text-xs text-admin-fg-muted leading-relaxed">{tile.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-admin-fg-subtle shrink-0 mt-1 group-hover:text-admin-accent group-hover:translate-x-0.5 transition-all" />
            </Link>
          )
        })}
      </div>

      {kpis.badgesAwarded === 0 && kpis.certificatesIssued === 0 && !loadFailed && (
        <div className="flex items-center gap-2 rounded-xl border border-admin-border bg-admin-surface/50 px-4 py-3 text-xs text-admin-fg-muted">
          <AlertTriangle className="w-4 h-4 text-admin-warning shrink-0" />
          No achievements have been earned yet. Badges and certificates will appear here as learners progress.
        </div>
      )}
    </AdminPageShell>
  )
}