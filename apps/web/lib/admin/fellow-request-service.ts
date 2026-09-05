import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'
import { AdminConsoleService } from './service'
import { createInAppNotification } from '../notifications/in-app/service'
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
   */
  public static async getQueue(statusFilter?: string): Promise<AdminFellowRequestItem[]> {
    const supabase = createServiceRoleClient()

    let query = supabase.from('fellow_requests').select('*').order('requested_at', { ascending: false }).limit(500)
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error || !data) return []

    const rows = data as unknown as FellowRequestRow[]
    if (rows.length === 0) return []

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
      }
    })
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

    // Best-effort notification — never block the admin decision on notification delivery.
    try {
      await createInAppNotification({
        userId: requestRow.user_id,
        category: 'achievements',
        title: decision === 'approved' ? 'You are now a PM Fellow!' : 'Fellow request update',
        body:
          decision === 'approved'
            ? 'Congratulations — your PM Fellow request has been approved. Your Fellow badge is now live on your portfolio.'
            : `Your PM Fellow request was not approved${cleanReason ? `: ${cleanReason}` : '.'}`,
        actionUrl: '/settings',
        priority: 'medium',
      })
    } catch {
      // Non-fatal
    }

    return { success: true }
  }
}
