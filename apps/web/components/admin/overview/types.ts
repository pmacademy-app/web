import type { AdminDateRangeKey } from '@/lib/admin/types'

/** The range inputs parsed from the overview page's searchParams. */
export interface OverviewRangeProps {
  rangeKey: AdminDateRangeKey
  from: string | null
  to: string | null
}
