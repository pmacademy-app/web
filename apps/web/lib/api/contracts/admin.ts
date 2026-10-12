/**
 * Client-safe admin API contracts and response interfaces (B10-D).
 *
 * All types in this file are pure TypeScript interfaces or client-safe schemas.
 * They MUST NOT import from server database modules, service-role clients,
 * Node built-ins, or Next.js server runtime utilities.
 */

import type { SystemErrorAlert } from '@/components/admin/AdminSystemAlertsView'
import type { AdminErrorGroupResult, AdminAuditLogResult, AdminAuditEntry } from '@/lib/admin/types'
import type { SystemAnnouncementItem } from '@/lib/admin/announcements-service'
import type { BroadcastListResult } from '@/lib/admin/broadcast-service'

export type { AdminAuditEntry, AdminAuditLogResult }

export interface AdminApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface AdminSystemAlertsResponse {
  success: boolean
  alerts: SystemErrorAlert[]
  unacknowledgedCriticalCount: number
  error?: string
}

export type AdminSystemErrorsResponse = AdminErrorGroupResult & {
  success?: boolean
  error?: string
}

export type AdminSystemAuditLogResponse = AdminAuditLogResult & {
  success?: boolean
  error?: string
}

export interface AdminAnnouncementsResponse {
  success: boolean
  announcements: SystemAnnouncementItem[]
  error?: string
}

export interface AdminBroadcastsResponse {
  success: boolean
  data?: BroadcastListResult
  error?: string
}

export interface AdminUserSearchResult {
  id: string
  email: string
  fullName?: string | null
  username?: string | null
}

export interface AdminSearchResultItem {
  id: string
  title: string
  subtitle: string
  category: 'users' | 'curriculum' | 'certificates' | 'communications'
  href: string
  badge?: string
}

export interface AdminSearchResponse {
  success: boolean
  query: string
  total: number
  results: {
    users: AdminSearchResultItem[]
    curriculum: AdminSearchResultItem[]
    certificates: AdminSearchResultItem[]
    communications: AdminSearchResultItem[]
  }
}

export interface AdminUsersQueryResponse {
  success: boolean
  users: AdminUserSearchResult[]
  total?: number
  error?: string
}

/** POST /api/admin/automations/lifecycle-preview: what a lifecycle run would do, with nothing written. */
export interface AdminLifecyclePreviewResponse {
  success: boolean
  dryRun: true
  force: boolean
  paused: boolean
  lifecycleQueued: number
  queuedBySequence: Record<string, number>
  heldOut: number
  skippedTimezone: number
  skippedNoSegment: number
  /** Pages of learners skipped entirely (lifecycle emails and nudges) by a failed progress or preferences read. */
  pagesSkipped: number
  nudges: Record<string, number>
  nudgesHeldOut: number
  /** Pages whose nudges were not evaluated: every page in `pagesSkipped`, plus nudge-only failures. */
  nudgePagesSkipped: number
  error?: string
}

/** POST /api/admin/cache/revalidate: the admin cache tag that was expired. */
export interface AdminCacheRevalidateResponse {
  success: boolean
  tag: string
  error?: string
}
