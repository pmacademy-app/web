'use client'

import React from 'react'
import Link from 'next/link'
import { Mail, Clock, AlertTriangle, MessageSquare, Star, Activity, ArrowRight, PauseCircle, CheckCircle2 } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminAttentionCenter } from './AdminAttentionCenter'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminCommunicationsOverview } from '@/lib/admin/communications-service'

interface AdminCommunicationsOverviewProps {
  data: AdminCommunicationsOverview
}

const ACTIVITY_ICONS: Record<AdminCommunicationsOverview['recentActivity'][number]['type'], React.ElementType> = {
  email: Mail,
  contact: MessageSquare,
  notification: Activity,
}

export function AdminCommunicationsOverview({ data }: AdminCommunicationsOverviewProps) {
  const { kpis, attention, recentActivity, globalPause } = data

  return (
    <div className="space-y-6">
      {/* Global email delivery status — the primary safety signal. Paused halts all
          non-critical mail (reminders, recaps, lifecycle sequences); critical auth
          emails always continue. Links to the master switch on the Automations tab. */}
      <Link
        href="/admin/communications?tab=automations"
        className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
          globalPause
            ? 'bg-admin-warning-soft border-admin-warning/30 hover:bg-admin-warning-soft/80'
            : 'bg-admin-surface border-admin-border hover:bg-admin-surface-raised'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {globalPause ? (
            <PauseCircle className="w-4 h-4 text-admin-warning shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-admin-success shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-bold text-admin-fg">
              {globalPause ? 'Non-critical email delivery is PAUSED' : 'Email delivery is active'}
            </p>
            <p className="text-[11px] text-admin-fg-muted truncate">
              {globalPause
                ? 'Reminders, recaps and lifecycle sequences are held in queue. Critical auth emails still send.'
                : 'Automated emails dispatch normally per individual toggles and daily quotas.'}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-accent shrink-0">
          Manage <ArrowRight className="w-3 h-3" />
        </span>
      </Link>

      {/* KPI grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <AdminKpiCard
          title="Emails Sent"
          value={kpis.emailsSent.toLocaleString()}
          subtitle="All emails in the queue ledger"
          icon={Mail}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="Pending"
          value={kpis.pending.toLocaleString()}
          subtitle="Awaiting worker pickup"
          icon={Clock}
          iconColor="text-admin-warning"
        />
        <AdminKpiCard
          title="Failed"
          value={kpis.failed.toLocaleString()}
          subtitle="Delivery failures"
          icon={AlertTriangle}
          iconColor="text-admin-danger"
        />
        <AdminKpiCard
          title="New Contact Messages"
          value={kpis.newContactMessages.toLocaleString()}
          subtitle="Awaiting response"
          icon={MessageSquare}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Pending Testimonials"
          value={kpis.pendingTestimonials.toLocaleString()}
          subtitle="Awaiting review"
          icon={Star}
          iconColor="text-admin-success"
        />
      </div>

      {/* Attention section */}
      <AdminAttentionCenter items={attention} />

      {/* Recent communication activity */}
      <AdminSection
        title="Recent Communication Activity"
        icon={Activity}
        meta="Latest events"
        actions={
          <Link
            href="/admin/communications?tab=email"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-admin-accent hover:underline"
          >
            View email history <ArrowRight className="w-3 h-3" />
          </Link>
        }
      >
        {recentActivity.length === 0 ? (
          <AdminEmptyState
            icon={Activity}
            title="No communication activity yet"
            description="Email dispatches, contact messages and notification events will appear here as they happen."
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-admin-border">
            {recentActivity.map((item) => {
              const Icon = ACTIVITY_ICONS[item.type]
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-3 py-3 rounded-lg transition-colors hover:bg-admin-bg/40 px-2 -mx-2"
                  >
                    <span className="p-2 rounded-lg bg-admin-surface-raised border border-admin-border shrink-0">
                      <Icon className="w-3.5 h-3.5 text-admin-accent" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-admin-fg truncate">{item.title}</p>
                      <p className="text-[11px] text-admin-fg-muted truncate">{item.detail}</p>
                    </div>
                    <time className="text-[10px] font-mono text-admin-fg-subtle shrink-0" dateTime={item.timestamp}>
                      {new Date(item.timestamp).toLocaleString()}
                    </time>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </AdminSection>
    </div>
  )
}