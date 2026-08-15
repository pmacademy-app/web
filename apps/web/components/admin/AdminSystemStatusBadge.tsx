import React from 'react'
import { AdminStatusBadge, type AdminStatusVariant } from './AdminStatusBadge'
import type { AdminSystemServiceStatus } from '@/lib/admin/types'

/**
 * Maps a service health status to the shared status badge. Color is always
 * paired with a text label so status is never communicated by color alone.
 */
const STATUS_MAP: Record<
  AdminSystemServiceStatus['status'],
  { variant: AdminStatusVariant; label: string }
> = {
  healthy: { variant: 'healthy', label: 'Operational' },
  degraded: { variant: 'warning', label: 'Degraded' },
  down: { variant: 'unhealthy', label: 'Down' },
  unknown: { variant: 'unmonitored', label: 'No telemetry' },
}

export function AdminSystemStatusBadge({ status }: { status: AdminSystemServiceStatus['status'] }) {
  const { variant, label } = STATUS_MAP[status]
  return <AdminStatusBadge status={variant} label={label} />
}