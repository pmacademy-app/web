import React from 'react'
import { loadDashboardRecentActivity } from '@/lib/admin/dashboard-service'
import { AdminRecentActivityList } from '@/components/admin/AdminRecentActivityList'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'

/** Latest platform activity. Not range-scoped. */
export async function OverviewRecentActivity() {
  const { recentActivity, failed } = await loadDashboardRecentActivity()

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="Recent activity could not be loaded." />}
      <AdminRecentActivityList items={recentActivity} />
    </div>
  )
}
