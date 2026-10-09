import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'
import { AdminConsoleService } from './service'
import { createInAppNotification } from '../notifications/in-app/service'
import { PORTFOLIO_SETTINGS_HREF } from '../portfolio'
import { calculatePortfolioReadiness } from '../portfolio-readiness'
import { isFellowEligible, type FellowRequestRowStatus } from '../fellow'

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

/** The learner's `users` columns read just before a grant (see `readLearnerBeforeGrant`). */
interface LearnerBeforeGrant {
  is_fellow: boolean | null
  username: string | null
  is_portfolio_public: boolean | null
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

    const userIds = Array.from(new Set(rows.map((r) => r.user_id)))

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

    const userMap = new Map((usersRes.data || []).map((u) => [u.id, u]))
    const publicCapstoneCounts = new Map<string, number>()
    for (const row of capstonesRes.data || []) {
      publicCapstoneCounts.set(row.user_id, (publicCapstoneCounts.get(row.user_id) || 0) + 1)
    }

    const items = rows.map((row) => {
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
      }
    })

    return { items, total: count ?? null }
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
      // `toggleUserFellowStatus` only reports that the learner is a Fellow afterwards, not whether
      // this call flipped them, so snapshot the flag first. A grant landing between this read and
      // the toggle is tolerated: the fallback below is idempotent per request.
      const learnerBefore = await FellowRequestAdminService.readLearnerBeforeGrant(supabase, requestRow.user_id)

      try {
        const ok = await AdminConsoleService.toggleUserFellowStatus(requestRow.user_id, true)
        if (!ok) {
          return { success: false, error: 'Failed to grant Fellow status.' }
        }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Failed to grant Fellow status.' }
      }

      // Announced here, next to the grant, rather than after the request-status update below: the
      // learner is a Fellow from this point even if that update fails, and a retry would then see
      // an existing Fellow and stay silent.
      if (learnerBefore?.is_fellow === false) {
        await FellowRequestAdminService.announceReapproval(supabase, requestRow, learnerBefore)
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

    // A first approval is announced by the `fellow.granted` event that `toggleUserFellowStatus`
    // dispatches (in-app + email), so only a rejection needs its own message here — writing one
    // on approval too would give the learner two "You are now a PM Fellow!" notifications. The
    // one exception is a re-approval after a revoke, where that event is deduplicated against
    // the first grant: `announceReapproval` (called above, right after the grant) covers it
    // in-app; the email stays deduplicated.
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

  /**
   * Reads the learner's Fellow flag (plus what the fallback deep link needs) before a grant.
   * Returns null when it cannot be read — the caller then treats the prior state as unknown
   * and writes no fallback, so a read problem never fails or changes the approval.
   */
  private static async readLearnerBeforeGrant(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userId: string
  ): Promise<LearnerBeforeGrant | null> {
    try {
      const { data, error } = (await (supabase.from('users') as unknown as DBChain)
        .select('is_fellow, username, is_portfolio_public')
        .eq('id', userId)
        .maybeSingle()) as unknown as { data: LearnerBeforeGrant | null; error: unknown }

      if (error) {
        console.error('[FellowRequestAdminService] pre-grant learner read failed:', error)
        return null
      }
      return data
    } catch (err) {
      console.error('[FellowRequestAdminService] pre-grant learner read failed:', err)
      return null
    }
  }

  /**
   * In-app fallback for a re-approval (request submitted after an earlier grant was revoked).
   *
   * `fellow.granted` uses a per-user id, so on a second grant its in-app row is deduplicated
   * against the first grant's and the learner would hear nothing. That case is recognised by
   * a `fellow-granted-<userId>` row created BEFORE this request was submitted; a missing row,
   * or one created after (this approval's own event), means the event announced it and nothing
   * is written — a first approval must never produce two messages.
   *
   * Keyed by request id, so each approved request yields at most one message and a retried or
   * double-clicked approval adds none. Best-effort: never throws.
   */
  private static async announceReapproval(
    supabase: ReturnType<typeof createServiceRoleClient>,
    requestRow: FellowRequestRow,
    learner: LearnerBeforeGrant
  ): Promise<void> {
    try {
      const { data: grantRow, error } = (await (supabase.from('in_app_notifications') as unknown as DBChain)
        .select('id, created_at')
        .eq('user_id', requestRow.user_id)
        .eq('idempotency_key', `fellow-granted-${requestRow.user_id}`)
        .maybeSingle()) as unknown as { data: { id: string; created_at: string } | null; error: unknown }

      if (error) {
        console.error('[FellowRequestAdminService] earlier-grant lookup failed:', error)
        return
      }

      // An unparseable timestamp compares false, i.e. stays silent.
      if (!grantRow || !(Date.parse(grantRow.created_at) < Date.parse(requestRow.requested_at))) {
        return
      }

      // Same deep-link rule as the `fellow.granted` in-app content: the public portfolio when
      // there is one to show, otherwise the portfolio settings tab.
      const username = typeof learner.username === 'string' ? learner.username.trim() : ''
      const portfolioPath =
        username && learner.is_portfolio_public === true ? `/p/${encodeURIComponent(username)}` : null

      await createInAppNotification({
        userId: requestRow.user_id,
        idempotencyKey: `fellow-request-approved-${requestRow.id}`,
        category: 'achievements',
        title: 'You are now a PM Fellow!',
        body: 'Congratulations! Your PM Fellow request was approved and your badge is live on your public portfolio.',
        actionUrl: portfolioPath ?? PORTFOLIO_SETTINGS_HREF,
        priority: 'high',
      })
    } catch (err) {
      console.error('[FellowRequestAdminService] re-approval notification failed:', err)
    }
  }
}
