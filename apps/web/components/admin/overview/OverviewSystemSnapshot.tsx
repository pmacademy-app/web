import React from 'react'
import { loadDashboardSystemSnapshot } from '@/lib/admin/dashboard-service'
import { AdminSystemSnapshot } from '@/components/admin/AdminSystemSnapshot'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'

/** Service status tiles. The slowest block (it probes the Auth admin API), so it sits last on the page. */
export async function OverviewSystemSnapshot() {
  const { systemSnapshot, failed } = await loadDashboardSystemSnapshot()

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="System status could not be loaded." />}
      <AdminSystemSnapshot items={systemSnapshot} />
    </div>
  )
}
