import { createServiceRoleClient } from '@/lib/supabase'

/**
 * Learner-side reads and dismissals for system announcements. Authoring (create,
 * update, publish, pause, delete) lives in the admin console repository.
 */

export type AnnouncementType = 'info' | 'warning' | 'critical' | 'success'
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired'
export type AnnouncementTarget = 'all' | 'cohort' | 'individual'

export interface SystemAnnouncementItem {
  id: string
  title: string
  content: string
  type: AnnouncementType
  status: AnnouncementStatus
  targetAudience: AnnouncementTarget
  targetCohortId: string | null
  targetUserId: string | null
  linkUrl: string | null
  linkText: string | null
  scheduledAt: string | null
  publishedAt: string | null
  expiresAt: string | null
  dismissible: boolean
  priority: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

function mapRowToItem(r: Record<string, unknown>): SystemAnnouncementItem {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    content: String(r.content || ''),
    type: (r.type as AnnouncementType) || 'info',
    status: (r.status as AnnouncementStatus) || 'draft',
    targetAudience: (r.target_audience as AnnouncementTarget) || 'all',
    targetCohortId: r.target_cohort_id ? String(r.target_cohort_id) : null,
    targetUserId: r.target_user_id ? String(r.target_user_id) : null,
    linkUrl: r.link_url ? String(r.link_url) : null,
    linkText: r.link_text ? String(r.link_text) : null,
    scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
    publishedAt: r.published_at ? String(r.published_at) : null,
    expiresAt: r.expires_at ? String(r.expires_at) : null,
    dismissible: r.dismissible !== false,
    priority: Number(r.priority) || 1,
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at || new Date().toISOString()),
    updatedAt: String(r.updated_at || new Date().toISOString()),
  }
}

/**
 * How many active announcements are scanned before audience filtering (B13-B).
 *
 * Generous on purpose: this is a safety bound on a query, not a business limit. An
 * install with more than this many simultaneously-active announcements has a content
 * problem, and the bound makes that visible instead of silently dropping rows at
 * PostgREST's invisible 1,000-row cap.
 */
export const ACTIVE_ANNOUNCEMENT_SCAN_LIMIT = 500

export class AnnouncementsService {
  /**
   * Fetch active, non-expired announcements for user application.
   * Respects target audience, scheduled start, expiration date, and user dismissals.
   */
  public static async getActiveAnnouncementsForUser(
    userId?: string | null,
    cohortId?: string | null
  ): Promise<SystemAnnouncementItem[]> {
    const supabase = createServiceRoleClient()
    const nowIso = new Date().toISOString()

    // 1. Fetch active announcements within validity window.
    //
    // B13-B: the explicit `.limit()` replaces an unbounded select. Unbounded is not
    // "all rows": PostgREST silently truncates at 1,000 and reports no error, so a
    // truncated answer was indistinguishable from a complete one (the F-COR-2 class).
    // The bound is stated so the truncation point is a decision rather than an
    // inherited default.
    //
    // It cannot become a `.range()` page: audience targeting is filtered in memory
    // below, so a database-level page would be taken *before* filtering and would
    // return short or empty pages that are not the caller's page at all. Paging
    // happens on the filtered result, at the route.
    const { data: rawList, error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .select('*')
      .eq('status', 'active')
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ACTIVE_ANNOUNCEMENT_SCAN_LIMIT)) as unknown as {
      data: Record<string, unknown>[] | null
      error: unknown
    }

    if (error || !rawList) return []

    // 2. Filter audience targeting & strictly enforce date bounds in-memory
    const now = new Date()
    const candidates = rawList.filter((r) => {
      if (r.status !== 'active') return false
      if (r.scheduled_at && new Date(String(r.scheduled_at)) > now) return false
      if (r.expires_at && new Date(String(r.expires_at)) <= now) return false

      const audience = r.target_audience
      if (audience === 'all') return true
      if (audience === 'cohort' && cohortId && r.target_cohort_id === cohortId) return true
      if (audience === 'individual' && userId && r.target_user_id === userId) return true
      return false
    })

    if (candidates.length === 0) return []

    // 3. If authenticated user, filter out dismissed announcements
    if (userId) {
      const candidateIds = candidates.map((c) => String(c.id))
      const { data: dismissals } = (await (supabase.from('user_announcement_dismissals') as unknown as DBChain)
        .select('announcement_id')
        .eq('user_id', userId)
        .in('announcement_id', candidateIds)) as unknown as {
        data: { announcement_id: string }[] | null
      }

      const dismissedSet = new Set((dismissals || []).map((d) => d.announcement_id))
      const items = candidates.filter((c) => !dismissedSet.has(String(c.id))).map(mapRowToItem)
      items.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
      return items
    }

    const items = candidates.map(mapRowToItem)
    items.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    return items
  }

  /**
   * Dismiss an announcement for a user.
   */
  public static async dismissAnnouncement(
    announcementId: string,
    userId: string
  ): Promise<boolean> {
    const supabase = createServiceRoleClient()

    const { error } = (await (supabase.from('user_announcement_dismissals') as unknown as DBChain)
      .upsert({
        user_id: userId,
        announcement_id: announcementId,
        dismissed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,announcement_id' })) as unknown as { error: unknown }

    return !error
  }
}
