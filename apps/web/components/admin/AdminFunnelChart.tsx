import React from 'react'
import { Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AdminFunnelStage } from '@/lib/admin/types'

interface AdminFunnelChartProps {
  stages: AdminFunnelStage[]
}

export function AdminFunnelChart({ stages }: AdminFunnelChartProps) {
  const maxCount = stages[0]?.count || 1

  return (
    <div className="p-6 rounded-xl bg-admin-surface border border-admin-border space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-admin-border pb-4">
        <h2 className="text-sm font-bold text-admin-fg uppercase tracking-wider flex items-center gap-2">
          <Filter className="w-4 h-4 text-admin-accent" />
          Learning Funnel
        </h2>
        <span className="text-[11px] font-mono text-admin-fg-muted">All-time journey</span>
      </div>

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
    </div>
  )
}