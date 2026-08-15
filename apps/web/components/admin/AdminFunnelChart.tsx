import React from 'react'
import { Funnel } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminSection } from './AdminSection'
import { AdminEmptyState } from './AdminEmptyState'
import type { AdminFunnelStage } from '@/lib/admin/types'

interface AdminFunnelChartProps {
  stages: AdminFunnelStage[]
}

export function AdminFunnelChart({ stages }: AdminFunnelChartProps) {
  const maxCount = stages[0]?.count || 1
  const hasData = stages.some((s) => s.count > 0)

  return (
    <AdminSection title="Learning Funnel" icon={Funnel} meta="All-time journey">
      {!hasData ? (
        <AdminEmptyState
          icon={Funnel}
          title="No funnel data yet"
          description="Conversion across registration, onboarding, lessons, quizzes and certificates will appear here as learners progress."
          className="py-10"
        />
      ) : (
        <div className="space-y-3">
          {stages.map((stage, idx) => {
            const width = maxCount === 0 ? 0 : Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)
            return (
              <div key={stage.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-admin-fg">{stage.label}</span>
                  <span className="flex items-center gap-2">
                    {stage.pctOfPrevious !== null && (
                      <span className="text-[10px] font-mono text-admin-fg-muted">
                        {stage.pctOfPrevious}% of prev
                      </span>
                    )}
                    <span className="font-mono font-bold text-admin-fg">{stage.count.toLocaleString()}</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-admin-bg border border-admin-border overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      idx === 0 ? 'bg-admin-accent' : 'bg-admin-accent/60'
                    )}
                    style={{ width: `${width}%` }}
                  />
                </div>
                <div className="text-[10px] font-mono text-admin-fg-muted">
                  {stage.pctOverall}% of registered
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AdminSection>
  )
}