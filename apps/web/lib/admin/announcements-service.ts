import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'

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

export interface AnnouncementCreateInput {
  title: string
  content: string
  type?: AnnouncementType
  status?: AnnouncementStatus
  targetAudience?: AnnouncementTarget
  targetCohortId?: string | null
  targetUserId?: string | null
  linkUrl?: string | null
  linkText?: string | null
  scheduledAt?: string | null
  publishedAt?: string | null
  expiresAt?: string | null
  dismissible?: boolean
  priority?: number
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

export class AnnouncementsService {
  /**
   * List announcements for Admin console with filtering & sorting.
   */
  public static async getAnnouncements(filters?: {
    status?: string
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ announcements: SystemAnnouncementItem[]; totalCount: number }> {
    const supabase = createServiceRoleClient()
    const limit = filters?.limit || 50
    const offset = filters?.offset || 0

    let query = (supabase.from('system_announcements') as unknown as DBChain)
      .select('*', { count: 'exact' })
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters?.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    if (filters?.search && filters.search.trim()) {
      query = query.ilike('title', `%${filters.search.trim()}%`)
    }

    const { data, error, count } = (await query.range(offset, offset + limit - 1)) as unknown as {
      data: Record<string, unknown>[] | null
      error: unknown
      count: number | null
    }

    if (error) {
      console.error('[AnnouncementsService.getAnnouncements] Error:', error)
      return { announcements: [], totalCount: 0 }
    }

    const announcements = (data || []).map(mapRowToItem)
    return { announcements, totalCount: count ?? announcements.length }
  }

  /**
   * Get single announcement by ID.
   */
  public static async getAnnouncementById(id: string): Promise<SystemAnnouncementItem | null> {
    const supabase = createServiceRoleClient()
    const { data, error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .select('*')
      .eq('id', id)
      .maybeSingle()) as unknown as { data: Record<string, unknown> | null; error: unknown }

    if (error || !data) return null
    return mapRowToItem(data)
  }

  /**
   * Create an announcement with audit logging.
   */
  public static async createAnnouncement(
    input: AnnouncementCreateInput,
    adminUserId: string | null,
    adminEmail: string
  ): Promise<SystemAnnouncementItem> {
    const supabase = createServiceRoleClient()

    let initialStatus = input.status || 'draft'
    const now = new Date()

    if (input.scheduledAt && new Date(input.scheduledAt) > now) {
      initialStatus = 'scheduled'
    } else if (initialStatus === 'active' && !input.publishedAt) {
      input.publishedAt = now.toISOString()
    }

    const insertPayload = {
      title: input.title.trim(),
      content: input.content.trim(),
      type: input.type || 'info',
      status: initialStatus,
      target_audience: input.targetAudience || 'all',
      target_cohort_id: input.targetCohortId || null,
      target_user_id: input.targetUserId || null,
      link_url: input.linkUrl?.trim() || null,
      link_text: input.linkText?.trim() || null,
      scheduled_at: input.scheduledAt || null,
      published_at: input.publishedAt || (initialStatus === 'active' ? now.toISOString() : null),
      expires_at: input.expiresAt || null,
      dismissible: input.dismissible !== false,
      priority: input.priority || 1,
      created_by: adminUserId,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    const { data, error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .insert(insertPayload)
      .select('*')
      .single()) as unknown as { data: Record<string, unknown> | null; error: unknown }

    if (error || !data) {
      throw new Error(`Failed to create announcement: ${String((error as Error)?.message || error)}`)
    }

    const created = mapRowToItem(data)

    await logAdminAction(
      adminUserId || 'system',
      adminEmail,
      'announcement_created',
      'system_announcements',
      created.id,
      { title: created.title, status: created.status, target: created.targetAudience }
    )

    return created
  }

  /**
   * Update announcement with audit logging.
   */
  public static async updateAnnouncement(
    id: string,
    input: Partial<AnnouncementCreateInput>,
    adminUserId: string | null,
    adminEmail: string
  ): Promise<SystemAnnouncementItem> {
    const supabase = createServiceRoleClient()
    const now = new Date()

    const updatePayload: Record<string, unknown> = {
      updated_at: now.toISOString(),
    }

    if (input.title !== undefined) updatePayload.title = input.title.trim()
    if (input.content !== undefined) updatePayload.content = input.content.trim()
    if (input.type !== undefined) updatePayload.type = input.type
    if (input.status !== undefined) updatePayload.status = input.status
    if (input.targetAudience !== undefined) updatePayload.target_audience = input.targetAudience
    if (input.targetCohortId !== undefined) updatePayload.target_cohort_id = input.targetCohortId
    if (input.targetUserId !== undefined) updatePayload.target_user_id = input.targetUserId
    if (input.linkUrl !== undefined) updatePayload.link_url = input.linkUrl?.trim() || null
    if (input.linkText !== undefined) updatePayload.link_text = input.linkText?.trim() || null
    if (input.scheduledAt !== undefined) updatePayload.scheduled_at = input.scheduledAt
    if (input.publishedAt !== undefined) updatePayload.published_at = input.publishedAt
    if (input.expiresAt !== undefined) updatePayload.expires_at = input.expiresAt
    if (input.dismissible !== undefined) updatePayload.dismissible = input.dismissible
    if (input.priority !== undefined) updatePayload.priority = input.priority

    const { data, error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single()) as unknown as { data: Record<string, unknown> | null; error: unknown }

    if (error || !data) {
      throw new Error(`Failed to update announcement: ${String((error as Error)?.message || error)}`)
    }

    const updated = mapRowToItem(data)

    await logAdminAction(
      adminUserId || 'system',
      adminEmail,
      'announcement_updated',
      'system_announcements',
      updated.id,
      { title: updated.title, status: updated.status }
    )

    return updated
  }

  /**
   * Immediately publish announcement.
   */
  public static async publishAnnouncement(
    id: string,
    adminUserId: string | null,
    adminEmail: string
  ): Promise<SystemAnnouncementItem> {
    const now = new Date().toISOString()
    return this.updateAnnouncement(
      id,
      { status: 'active', publishedAt: now },
      adminUserId,
      adminEmail
    )
  }

  /**
   * Toggle pause / resume.
   */
  public static async togglePauseAnnouncement(
    id: string,
    paused: boolean,
    adminUserId: string | null,
    adminEmail: string
  ): Promise<SystemAnnouncementItem> {
    const status: AnnouncementStatus = paused ? 'paused' : 'active'
    return this.updateAnnouncement(
      id,
      { status },
      adminUserId,
      adminEmail
    )
  }

  /**
   * Delete / archive announcement.
   */
  public static async deleteAnnouncement(
    id: string,
    adminUserId: string | null,
    adminEmail: string
  ): Promise<boolean> {
    const supabase = createServiceRoleClient()

    const { error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .delete()
      .eq('id', id)) as unknown as { error: unknown }

    if (error) {
      throw new Error(`Failed to delete announcement: ${String((error as Error)?.message || error)}`)
    }

    await logAdminAction(
      adminUserId || 'system',
      adminEmail,
      'announcement_deleted',
      'system_announcements',
      id,
      { id }
    )

    return true
  }

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

    // 1. Fetch active announcements within validity window
    const { data: rawList, error } = (await (supabase.from('system_announcements') as unknown as DBChain)
      .select('*')
      .eq('status', 'active')
      .or(`scheduled_at.is.null,scheduled_at.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })) as unknown as {
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
