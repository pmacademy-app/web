import React from 'react'
import { FlaskConical } from 'lucide-react'
import { ExperimentReadoutService } from '@/lib/admin/experiment-readout-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ExperimentReadoutView } from '@/components/admin/ExperimentReadoutView'

export const revalidate = 0

/**
 * Phase 8.1 — Experiment Readout.
 *
 * Admin-only by construction: every page in the `(console)` route group renders behind
 * `AdminConsoleLayout`, which redirects non-admins before this component runs. The readout is
 * aggregated server-side by `ExperimentReadoutService` from tables the app already writes, calling
 * the three existing experiment aggregators (recut, module-entry unlock, capstone threshold). There
 * is deliberately no API route, so the data never has a learner-facing surface.
 */
export default async function AdminExperimentReadoutPage() {
  const data = await ExperimentReadoutService.getReadout()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Experiment Readout"
        description="Control-vs-treatment results for the recut, module-entry unlock, and capstone-threshold experiments. Server-side, GA4-independent (Phase 8.1)."
        icon={FlaskConical}
      />

      <ExperimentReadoutView data={data} />
    </div>
  )
}
