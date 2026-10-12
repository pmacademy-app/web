import React from 'react'
import { loadDashboardAttention } from '@/lib/admin/dashboard-service'
import { AdminAttentionCenter } from '@/components/admin/AdminAttentionCenter'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'
import type { OverviewRangeProps } from './types'

/** "Needs Attention" block. Streams on its own; a failed load shows a warning in this block only. */
export async function OverviewAttention({ rangeKey, from, to }: OverviewRangeProps) {
  const { attention, failed } = await loadDashboardAttention(rangeKey, from, to)

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="Attention items could not be loaded." />}
      <AdminAttentionCenter items={attention} />
    </div>
  )
}
