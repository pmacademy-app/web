import React from 'react'
import { AdminStatusBadge } from './AdminStatusBadge'

/**
 * Maps `email_queue` statuses onto the shared admin badge palette.
 * Used by both the Email dashboard and the Queue operational view so the
 * status vocabulary stays consistent across the Communications workspace.
 */
export function AdminEmailStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'delivered':
      return <AdminStatusBadge status="delivered" label="Delivered" />
    case 'pending':
      return <AdminStatusBadge status="pending" label="Pending" />
    case 'processing':
      return <AdminStatusBadge status="processing" label="Processing" />
    case 'retrying':
      return <AdminStatusBadge status="warning" label="Retrying" />
    case 'failed':
      return <AdminStatusBadge status="failed" label="Failed" />
    case 'dead_letter':
      return <AdminStatusBadge status="danger" label="Dead Letter" />
    case 'suppressed':
    case 'skipped':
      return <AdminStatusBadge status="archived" label={status} />
    default:
      return <AdminStatusBadge status="unmonitored" label={status} />
  }
}