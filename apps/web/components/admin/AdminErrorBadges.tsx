import React from 'react'
import { AdminStatusBadge } from './AdminStatusBadge'
import type { AdminErrorGroup } from '@/lib/admin/types'

/** Severity badge for a grouped system error (critical/error/warning). */
export function AdminErrorSeverityBadge({ severity }: { severity: AdminErrorGroup['severity'] }) {
  if (severity === 'critical') return <AdminStatusBadge status="danger" label="Critical" />
  if (severity === 'error') return <AdminStatusBadge status="warning" label="Error" />
  return <AdminStatusBadge status="warning" label="Warning" />
}

/** Lifecycle status badge for a grouped system error. */
export function AdminErrorStatusBadge({ status }: { status: AdminErrorGroup['status'] }) {
  if (status === 'new') return <AdminStatusBadge status="warning" label="New" />
  if (status === 'acknowledged') return <AdminStatusBadge status="info" label="Acknowledged" />
  return <AdminStatusBadge status="healthy" label="Resolved" />
}