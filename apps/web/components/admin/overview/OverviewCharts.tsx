import React from 'react'
import { loadDashboardSeries } from '@/lib/admin/dashboard-service'
import { AdminLearnerActivityChartLazy, AdminLearningActivityChartLazy } from '@/components/admin/charts-lazy'
import { AdminLoadWarning } from '@/components/admin/AdminLoadWarning'
import type { OverviewRangeProps } from './types'

/** The two activity charts. recharts loads on demand through charts-lazy. */
export async function OverviewCharts({ rangeKey, from, to }: OverviewRangeProps) {
  const { series, failed } = await loadDashboardSeries(rangeKey, from, to)

  return (
    <div className="space-y-3">
      {failed && <AdminLoadWarning message="Activity charts could not be loaded." />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminLearnerActivityChartLazy data={series} />
        <AdminLearningActivityChartLazy data={series} />
      </div>
    </div>
  )
}
