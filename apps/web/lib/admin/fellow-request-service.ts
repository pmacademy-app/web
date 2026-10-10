import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'
import { AdminConsoleService } from './service'
import { createInAppNotification } from '../notifications/in-app/service'
import { calculatePortfolioReadiness } from '../portfolio-readiness'
import { isFellowEligible, type FellowRequestRowStatus } from '../fellow'
import {
  normalizeModerationPaging,
  normalizeModerationStatus,
  runCountedPage,
  type ModerationPage,
  type ModerationPageParams,
  type RangeableCountQuery,
} from './moderation-service'

/** Status tabs the Fellow requests view offers (FellowRequestsView). */
export const FELLOW_REQUEST_STATUS_FILTERS = ['pending', 'approved', 'rejected', 'all'] as const

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

interface FellowRequestRow {
  id: string
  user_id: string
  status: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
}

export interface AdminFellowRequestItem {
  id: string
  userId: string
  userName: string
  username: string | null
  email: string | null
  status: FellowRequestRowStatus
  requestedAt: string
  reviewedBy: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  isEligible: boolean
  isPortfolioPublic: boolean
  readinessCompletedCount: number
  readinessTotalCount: number
  isFellow: boolean
  /**
   * The learner's Fellow history, oldest first (admin R6 C4). Empty when the history read
   * failed — a history problem never fails the queue.
   */
  history: FellowHistoryEvent[]
}

/**
 * One entry in a learner's Fellow history (admin R6 C4):
 * - `request`: a fellow_requests row (this item's own request included; match on `requestId`).
 * - `admin_grant` / `admin_revoke`: a direct status change by an admin from the users console
 *   (admin_audit_logs `grant_fellow_status` / `revoke_fellow_status`), which creates no request row.
 * - `celebration`: the in-app "you are a Fellow" notification written for a grant
 *   (in_app_notifications, idempotency key `fellow-granted-…`); `seen` is its read state.
 */
export type FellowHistoryEvent =
  | {
      kind: 'request'
      at: string
      requestId: string
      status: FellowRequestRowStatus
      reviewedAt: string | null
      rejectionReason: string | null
    }
  | { kind: 'admin_grant' | 'admin_revoke'; at: string; adminEmail: string | null }
  | { kind: 'celebration'; at: string; seen: boolean }

/** Users per batched `.in()` history read. */
const HISTORY_CHUNK = 100
/** Upper bound on rows per history source per chunk, so one noisy user cannot blow up a page. */
const HISTORY_ROW_LIMIT = 2000
const FELLOW_AUDIT_ACTIONS = ['grant_fellow_status', 'revoke_fellow_status'] as const
const FELLOW_CELEBRATION_KEY_PREFIX = 'fellow-granted-'

/** Stable order for events at the same instant: request, then admin change, then celebration. */
const HISTORY_KIND_ORDER: Record<FellowHistoryEvent['kind'], number> = {
  request: 0,
  admin_revoke: 1,
  admin_grant: 2,
  celebration: 3,
}

/** Sorts history events oldest first; ties keep a fixed kind order. Pure, exported for tests. */
export function sortFellowHistory(events: FellowHistoryEvent[]): FellowHistoryEvent[] {
  return [...events].sort((a, b) => {
    const diff = Date.parse(a.at) - Date.parse(b.at)
    if (diff !== 0 && Number.isFinite(diff)) return diff
    return HISTORY_KIND_ORDER[a.kind] - HISTORY_KIND_ORDER[b.kind]
  })
}

interface AuditLogRow {
  target_id: string | null
  action: string
  admin_email: string | null
  created_at: string
}

interface CelebrationRow {
  user_id: string
  idempotency_key: string | null
  is_read: boolean | null
  created_at: string
}

export class FellowRequestAdminService {
  /**
   * Fetches the Fellow request queue with eligibility/readiness context for admin review.
   * Batches user + capstone lookups (no N+1 per-request queries).
   *
   * B13-B: `window` replaces a hard-coded `.limit(500)`. That bound was not a page — it
   * was a ceiling with nothing above it, so the 501st request was unreachable through
   * the API rather than merely on a later page. The count is returned alongside so the
   * route can report a real `total`; the per-page user and capstone lookups stay batched.
   */
  public static async getQueue(
    statusFilter?: string,
    window?: { from: number; to: number }
  ): Promise<{ items: AdminFellowRequestItem[]; total: number | null }> {
    const supabase = createServiceRoleClient()
    const range = window ?? { from: 0, to: 499 }

    let query = supabase
      .from('fellow_requests')
      .select('*', { count: 'exact' })
      .order('requested_at', { ascending: false })
      .range(range.from, range.to)
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error, count } = await query
    if (error || !data) return { items: [], total: 0 }

    const rows = data as unknown as FellowRequestRow[]
    if (rows.length === 0) return { items: [], total: count ?? 0 }

    const items = await this.toQueueItems(supabase, rows)
    return { items, total: count ?? null }
  }

  /**
   * One page of the Fellow request queue (admin R6 B7).
   *
   * Filter (FellowRequestsView): `status` is 'pending', 'approved', 'rejected' or 'all';
   * absent or unknown → 'pending', the view's default tab. Exact `status` match; newest
   * request first. The view has no search, so none is offered here. The user and capstone
   * lookups are one batched `.in()` each over this page's users.
   */
  public static async getQueuePage(
    params: ModerationPageParams = {}
  ): Promise<ModerationPage<AdminFellowRequestItem>> {
    const { page, pageSize, from, to } = normalizeModerationPaging(params.page, params.pageSize)
    const status = normalizeModerationStatus(params.status, FELLOW_REQUEST_STATUS_FILTERS, 'pending')
    const supabase = createServiceRoleClient()

    const build = () => {
      let query = supabase.from('fellow_requests').select('*', { count: 'exact' })
      if (status !== 'all') query = query.eq('status', status)
      return query.order('requested_at', { ascending: false }).order('id', { ascending: false })
    }

    try {
      const { rows, total } = await runCountedPage<FellowRequestRow>(
        () => build() as unknown as RangeableCountQuery,
        from,
        to
      )
      const items = rows.length > 0 ? await this.toQueueItems(supabase, rows) : []
      return { items, total, page, pageSize, failed: false }
    } catch (err) {
      console.warn('[FellowRequestAdminService] getQueuePage failed:', err)
      return { items: [], total: 0, page, pageSize, failed: true }
    }
  }

  /** Adds eligibility/readiness context to request rows: one batched users and capstones read. */
  private static async toQueueItems(
    supabase: ReturnType<typeof createServiceRoleClient>,
    rows: FellowRequestRow[]
  ): Promise<AdminFellowRequestItem[]> {
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)))
    // Never rejects: a history failure degrades to empty histories inside the loader.
    const historyPromise = this.loadFellowHistory(supabase, userIds)

    const [usersRes, capstonesRes] = await Promise.all([
      (supabase.from('users') as unknown as DBChain)
        .select('id, name, username, email, bio, avatar_url, linkedin_url, github_url, website_url, is_portfolio_public, is_fellow')
        .in('id', userIds) as unknown as Promise<{
        data: Array<{
          id: string
          name: string | null
          username: string | null
          email: string | null
          bio: string | null
          avatar_url: string | null
          linkedin_url: string | null
          github_url: string | null
          website_url: string | null
          is_portfolio_public: boolean
          is_fellow: boolean
        }> | null
      }>,
      (supabase.from('capstone_submissions') as unknown as DBChain)
        .select('user_id, is_public')
        .in('user_id', userIds)
        .eq('is_public', true) as unknown as Promise<{ data: Array<{ user_id: string }> | null }>,
    ])

    const historyByUser = await historyPromise

    const userMap = new Map((usersRes.data || []).map((u) => [u.id, u]))
    const publicCapstoneCounts = new Map<string, number>()
    for (const row of capstonesRes.data || []) {
      publicCapstoneCounts.set(row.user_id, (publicCapstoneCounts.get(row.user_id) || 0) + 1)
    }

    return rows.map((row) => {
      const user = userMap.get(row.user_id)
      const readiness = calculatePortfolioReadiness({
        name: user?.name,
        username: user?.username,
        bio: user?.bio,
        avatarUrl: user?.avatar_url,
        linkedinUrl: user?.linkedin_url,
        githubUrl: user?.github_url,
        websiteUrl: user?.website_url,
        isPortfolioPublic: user?.is_portfolio_public,
        publicCapstonesCount: publicCapstoneCounts.get(row.user_id) || 0,
      })

      return {
        id: row.id,
        userId: row.user_id,
        userName: user?.name || user?.username || 'Learner',
        username: user?.username ?? null,
        email: user?.email ?? null,
        status: row.status as FellowRequestRowStatus,
        requestedAt: row.requested_at,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        rejectionReason: row.rejection_reason,
        isEligible: isFellowEligible(readiness),
        isPortfolioPublic: Boolean(user?.is_portfolio_public),
        readinessCompletedCount: readiness.completedCount,
        readinessTotalCount: readiness.totalCount,
        isFellow: Boolean(user?.is_fellow),
        history: historyByUser.get(row.user_id) ?? [],
      }
    })
  }

  /**
   * Builds each user's Fellow history (admin R6 C4) from three sources, each read once per
   * chunk of user ids with `.in()`: every fellow_requests row, the admin grant/revoke audit
   * entries, and the fellow-granted celebration notifications. Best-effort: on any read
   * failure every user gets an empty history and the queue still renders.
   */
  private static async loadFellowHistory(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: string[]
  ): Promise<Map<string, FellowHistoryEvent[]>> {
    const byUser = new Map<string, FellowHistoryEvent[]>()
    if (userIds.length === 0) return byUser
    const push = (userId: string, event: FellowHistoryEvent) => {
      const list = byUser.get(userId)
      if (list) list.push(event)
      else byUser.set(userId, [event])
    }

    try {
      for (let i = 0; i < userIds.length; i += HISTORY_CHUNK) {
        const chunk = userIds.slice(i, i + HISTORY_CHUNK)
        const [requestsRes, auditRes, celebrationsRes] = (await Promise.all([
          (supabase.from('fellow_requests') as unknown as DBChain)
            .select('id, user_id, status, requested_at, reviewed_at, rejection_reason')
            .in('user_id', chunk)
            .order('requested_at', { ascending: true })
            .limit(HISTORY_ROW_LIMIT),
          (supabase.from('admin_audit_logs') as unknown as DBChain)
            .select('target_id, action, admin_email, created_at')
            .eq('target_resource', 'user')
            .in('action', [...FELLOW_AUDIT_ACTIONS])
            .in('target_id', chunk)
            .order('created_at', { ascending: true })
            .limit(HISTORY_ROW_LIMIT),
          (supabase.from('in_app_notifications') as unknown as DBChain)
            .select('user_id, idempotency_key, is_read, created_at')
            .in('user_id', chunk)
            .like('idempotency_key', `${FELLOW_CELEBRATION_KEY_PREFIX}%`)
            .order('created_at', { ascending: true })
            .limit(HISTORY_ROW_LIMIT),
        ])) as Array<{ data: unknown; error: unknown }>

        for (const res of [requestsRes, auditRes, celebrationsRes]) {
          if (res.error) throw res.error
        }

        for (const r of (requestsRes.data || []) as Array<Omit<FellowRequestRow, 'reviewed_by'>>) {
          push(r.user_id, {
            kind: 'request',
            at: r.requested_at,
            requestId: r.id,
            status: r.status as FellowRequestRowStatus,
            reviewedAt: r.reviewed_at,
            rejectionReason: r.rejection_reason,
          })
        }
        for (const a of (auditRes.data || []) as AuditLogRow[]) {
          if (!a.target_id) continue
          push(a.target_id, {
            kind: a.action === 'grant_fellow_status' ? 'admin_grant' : 'admin_revoke',
            at: a.created_at,
            adminEmail: a.admin_email ?? null,
          })
        }
        for (const c of (celebrationsRes.data || []) as CelebrationRow[]) {
          if (!c.idempotency_key?.startsWith(FELLOW_CELEBRATION_KEY_PREFIX)) continue
          push(c.user_id, { kind: 'celebration', at: c.created_at, seen: Boolean(c.is_read) })
        }
      }
    } catch (err) {
      console.warn('[FellowRequestAdminService] Fellow history read failed:', err)
      return new Map()
    }

    for (const [userId, events] of byUser) byUser.set(userId, sortFellowHistory(events))
    return byUser
  }

  /**
   * Approves or rejects a pending Fellow request. Approval reuses the existing
   * `AdminConsoleService.toggleUserFellowStatus` grant path (including its public-
   * portfolio invariant and cache revalidation) rather than duplicating that logic.
   */
  public static async reviewRequest(
    adminUserId: string,
    adminEmail: string,
    requestId: string,
    decision: 'approved' | 'rejected',
    rejectionReason?: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()

    const { data: requestRow, error: fetchError } = (await (supabase.from('fellow_requests') as unknown as DBChain)
      .select('*')
      .eq('id', requestId)
      .maybeSingle()) as unknown as { data: FellowRequestRow | null; error: unknown }

    if (fetchError || !requestRow) {
      return { success: false, error: 'Fellow request not found.' }
    }

    if (requestRow.status !== 'pending') {
      return { success: false, error: `This request has already been ${requestRow.status}.` }
    }

    if (decision === 'approved') {
      // The grant announces itself: `toggleUserFellowStatus` dispatches `fellow.granted` on a real
      // false → true flip, with a per-grant event id, so a re-approval after a revoke is announced
      // like a first approval (Growth R5 P1).
      try {
        const ok = await AdminConsoleService.toggleUserFellowStatus(requestRow.user_id, true)
        if (!ok) {
          return { success: false, error: 'Failed to grant Fellow status.' }
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to grant Fellow status.' }
      }
    }

    const cleanReason = decision === 'rejected' ? rejectionReason?.trim() || null : null
    const { error: updateError } = await (supabase.from('fellow_requests') as unknown as DBChain)
      .update({
        status: decision,
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: cleanReason,
      })
      .eq('id', requestId)

    if (updateError) {
      return { success: false, error: 'Failed to update request status.' }
    }

    await logAdminAction(adminUserId, adminEmail, `fellow_request_${decision}`, 'fellow_request', requestId, {
      userId: requestRow.user_id,
      decision,
    })

    // Every approval, including a re-approval after a revoke, is announced by the `fellow.granted`
    // event that `toggleUserFellowStatus` dispatches (in-app + email), so only a rejection needs its
    // own message here — writing one on approval too would give the learner two notifications.
    // Best-effort notification — never block the admin decision on notification delivery.
    if (decision === 'rejected') {
      try {
        await createInAppNotification({
          userId: requestRow.user_id,
          category: 'achievements',
          title: 'Fellow request update',
          body: `Your PM Fellow request was not approved${cleanReason ? `: ${cleanReason}` : '.'}`,
          actionUrl: '/settings',
          priority: 'medium',
        })
      } catch {
        // Non-fatal
      }
    }

    return { success: true }
  }
}
