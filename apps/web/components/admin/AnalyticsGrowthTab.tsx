'use client'

import React from 'react'
import { PartyPopper, UserPlus, Globe, Sparkles, Info } from 'lucide-react'
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSection } from './AdminSection'
import { AdminLoadWarning } from './AdminLoadWarning'
import type { AdminAnalyticsGrowthData } from '@/lib/admin/types'

interface AnalyticsGrowthTabProps {
  data?: AdminAnalyticsGrowthData
}

export const GROWTH_GA_NOTE =
  'Share clicks by context (portfolio, badge, capstone, Fellow) are tracked in Google Analytics only.'

interface Step {
  label: string
  value: number
  hint?: string
}

/** Plain CSS bars, scaled to the largest step so no bar ever overflows. */
function StepBars({ steps, label }: { steps: Step[]; label: string }) {
  const max = Math.max(1, ...steps.map((s) => s.value))
  return (
    <ol aria-label={label} className="space-y-4">
      {steps.map((step) => {
        const pct = Math.min(100, Math.round((step.value / max) * 100))
        return (
          <li key={step.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-admin-fg">{step.label}</span>
              <span className="font-bold tabular-nums text-admin-fg">{step.value.toLocaleString()}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-admin-surface-raised overflow-hidden" aria-hidden="true">
              <div
                className="h-full rounded-full bg-admin-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
            {step.hint && <p className="text-[11px] text-admin-fg-muted">{step.hint}</p>}
          </li>
        )
      })}
    </ol>
  )
}

export function AnalyticsGrowthTab({ data }: AnalyticsGrowthTabProps) {
  if (!data) {
    return <AdminLoadWarning message="Growth metrics could not be loaded for this range." />
  }

  const { celebrations, referrals, publicCapstonePages, fellowRequests } = data

  return (
    <div className="space-y-6">
      {data.failed && (
        <AdminLoadWarning message="Some growth counts could not be loaded. Missing counts show as 0." />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AdminKpiCard
          title="Celebrations Shown"
          value={celebrations.created.toLocaleString()}
          subtitle="In selected range"
          icon={PartyPopper}
          iconColor="text-admin-accent"
        />
        <AdminKpiCard
          title="Referrals (signed up)"
          value={referrals.signedUp.toLocaleString()}
          subtitle="In selected range"
          icon={UserPlus}
          iconColor="text-admin-info"
        />
        <AdminKpiCard
          title="Public Capstone Pages"
          value={publicCapstonePages.toLocaleString()}
          subtitle="Currently public (not limited to the range)"
          icon={Globe}
          iconColor="text-admin-success"
        />
        <AdminKpiCard
          title="Fellow Requests"
          value={fellowRequests.total.toLocaleString()}
          subtitle="Requested in selected range"
          icon={Sparkles}
          iconColor="text-admin-warning"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminSection title="Referral Funnel" icon={UserPlus} meta="Selected range">
          <StepBars
            label="Referral funnel"
            steps={[
              { label: 'Referrals (signed up)', value: referrals.signedUp },
              { label: 'Activated', value: referrals.activated },
              {
                label: 'Rewarded',
                value: referrals.rewarded,
                hint: 'Counted by reward date, so it can include referrals from before the range.',
              },
            ]}
          />
        </AdminSection>

        <AdminSection title="Celebrations" icon={PartyPopper} meta="Selected range">
          <StepBars
            label="Celebrations"
            steps={[
              { label: 'Shown', value: celebrations.created },
              {
                label: 'Claimed',
                value: celebrations.claimed,
                hint: 'Counted by claim date.',
              },
            ]}
          />
        </AdminSection>

        <AdminSection title="Fellow Requests" icon={Sparkles} meta="Requested in range, by current status">
          <dl className="grid grid-cols-3 gap-3">
            {(
              [
                ['Pending', fellowRequests.pending],
                ['Approved', fellowRequests.approved],
                ['Rejected', fellowRequests.rejected],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-admin-border bg-admin-surface-raised px-3 py-3">
                <dt className="text-[11px] font-semibold text-admin-fg-muted">{label}</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-admin-fg">{value.toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </AdminSection>

        <AdminSection title="Public Capstone Pages" icon={Globe} meta="Current count">
          <p className="text-2xl font-bold tabular-nums text-admin-fg">{publicCapstonePages.toLocaleString()}</p>
          <p className="mt-1 text-xs text-admin-fg-muted">
            Reviewed capstones that are public on a public portfolio, currently public (not limited to the range).
          </p>
        </AdminSection>
      </div>

      <p className="flex items-start gap-2 text-xs text-admin-fg-muted">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
        <span>{GROWTH_GA_NOTE}</span>
      </p>
    </div>
  )
}
