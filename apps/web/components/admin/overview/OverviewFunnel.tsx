import React from 'react'
import { loadDashboardFunnel } from '@/lib/admin/dashboard-service'
import { AdminFunnelChart } from '@/components/admin/AdminFunnelChart'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'

/** All-time learning funnel. Not range-scoped. */
export async function OverviewFunnel() {
  const { funnel, failed } = await loadDashboardFunnel()

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="The learning funnel could not be loaded." />}
      <AdminFunnelChart stages={funnel} />
    </div>
  )
}
