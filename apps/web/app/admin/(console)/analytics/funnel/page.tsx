import React from 'react'
import { Filter } from 'lucide-react'
import { FunnelService } from '@/lib/admin/funnel-service'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ActivationFunnelView } from '@/components/admin/ActivationFunnelView'

export const revalidate = 0

/**
 * Phase 2 — Activation Funnel.
 *
 * Admin-only by construction: every page in the `(console)` route group renders behind
 * `AdminConsoleLayout`, which redirects non-admins before this component runs. The funnel
 * itself is aggregated server-side from tables the app already writes (see
 * `FunnelService`), so it is measurable even when analytics consent is declined.
 */
export default async function AdminActivationFunnelPage() {
  const data = await FunnelService.getActivationFunnel()

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Activation Funnel"
        description="Authoritative, server-side signup → capstone funnel. Independent of GA4/GTM and cookie consent (IMPLEMENTATION_PLAN §5.2)."
        icon={Filter}
      />

      <ActivationFunnelView data={data} />
    </div>
  )
}
