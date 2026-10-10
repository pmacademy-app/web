import { unstable_cache, revalidateTag } from 'next/cache'
import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'
import {
  normalizeModerationPaging,
  normalizeModerationStatus,
  runCountedPage,
  type ModerationPage,
  type ModerationPageParams,
  type RangeableCountQuery,
} from './moderation-service'

interface DBChain {
  [method: string]: (...args: unknown[]) => DBChain & Promise<{ data: unknown; error: unknown }>
}

export interface TestimonialItem {
  id: string
  userId: string | null
  authorName: string
  authorRole: string
  sourceEvent: string
  content: string
  status: 'pending' | 'approved' | 'rejected'
  isPublished: boolean
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

interface TestimonialRow {
  id: string
  user_id: string | null
  source_event: string
  content: string
  status: string
  is_published: boolean
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

/** Status tabs the testimonials view offers (FeedbackModerationView). */
export const TESTIMONIAL_STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected'] as const
/** Statuses an admin can set on private feedback (FeedbackListView). */
export const PRIVATE_FEEDBACK_STATUS_FILTERS = ['all', 'new', 'reviewed', 'planned', 'resolved', 'dismissed'] as const

export interface AdminPrivateFeedbackItem {
  id: string
  userId: string | null
  authorName: string
  authorEmail: string | null
  userExists: boolean
  category: string
  sourceEvent: string
  content: string
  rating: number | null
  status: string
  createdAt: string
}

interface PrivateFeedbackRow {
  id: string
  user_id: string | null
  category: string
  source_event: string
  content: string
  rating: number | null
  status: string
  created_at: string
}

type FeedbackUserRow = { id: string; name?: string | null; username?: string | null; email?: string | null }

const PRIVATE_FEEDBACK_COLUMNS = 'id, user_id, category, source_event, content, rating, status, created_at'

export class FeedbackAdminService {
  /** Looks up author rows for a set of user ids in chunked `.in()` reads (no per-row queries). */
  private static async fetchAuthors(
    supabase: ReturnType<typeof createServiceRoleClient>,
    userIds: string[]
  ): Promise<FeedbackUserRow[]> {
    const uniqueIds = [...new Set(userIds)]
    const rows: FeedbackUserRow[] = []
    const CHUNK = 500
    for (let i = 0; i < uniqueIds.length; i += CHUNK) {
      const { data } = await supabase
        .from('users')
        .select('id, name, username, email')
        .in('id', uniqueIds.slice(i, i + CHUNK))
      if (data) rows.push(...(data as unknown as FeedbackUserRow[]))
    }
    return rows
  }

  /** Attributes testimonial rows to their authors (one batched users lookup). */
  private static async toTestimonialItems(
    supabase: ReturnType<typeof createServiceRoleClient>,
    rows: TestimonialRow[]
  ): Promise<TestimonialItem[]> {
    const userIds = rows.map((t) => t.user_id).filter(Boolean) as string[]
    const userMap = new Map<string, { name: string; username: string }>()

    if (userIds.length > 0) {
      const uList = await this.fetchAuthors(supabase, userIds)
      uList.forEach((u) => {
        userMap.set(u.id, {
          name: u.name?.trim() || u.username?.trim() || (u.email ? u.email.split('@')[0] : '') || 'Learner',
          username: u.username?.trim() || `user_${u.id.substring(0, 6)}`,
        })
      })
    }

    return rows.map((item) => {
      const itemExt = item as unknown as TestimonialRow & { author_name?: string; author_role?: string }
      const userMeta = item.user_id ? userMap.get(item.user_id) : null
      return {
        id: item.id,
        userId: item.user_id,
        authorName: itemExt.author_name || userMeta?.name || (item.user_id ? 'Deleted Learner' : 'PM Academy Learner'),
        authorRole: itemExt.author_role || 'PM Academy Learner',
        sourceEvent: item.source_event,
        content: item.content,
        status: item.status as 'pending' | 'approved' | 'rejected',
        isPublished: item.is_published,
        reviewedBy: item.reviewed_by,
        reviewedAt: item.reviewed_at,
        createdAt: item.created_at,
      }
    })
  }

  /** Attributes private feedback rows to their authors (one batched users lookup). */
  private static async toPrivateFeedbackItems(
    supabase: ReturnType<typeof createServiceRoleClient>,
    rows: PrivateFeedbackRow[]
  ): Promise<AdminPrivateFeedbackItem[]> {
    const userIds = rows.map((f) => f.user_id).filter(Boolean) as string[]
    const userMap = new Map<string, { name: string; email: string }>()

    if (userIds.length > 0) {
      const uList = await this.fetchAuthors(supabase, userIds)
      uList.forEach((u) => {
        userMap.set(u.id, {
          name: u.name?.trim() || u.username?.trim() || (u.email ? u.email.split('@')[0] : '') || 'Learner',
          email: u.email || '',
        })
      })
    }

    return rows.map((f) => {
      const userInfo = f.user_id ? userMap.get(f.user_id) : null
      return {
        id: f.id,
        userId: f.user_id,
        authorName: userInfo ? userInfo.name : (f.user_id ? 'Deleted Learner' : 'Anonymous Learner'),
        authorEmail: userInfo ? userInfo.email : null,
        userExists: Boolean(userInfo),
        category: f.category,
        sourceEvent: f.source_event,
        content: f.content,
        rating: f.rating,
        status: f.status,
        createdAt: f.created_at,
      }
    })
  }

  /**
   * Submits learner feedback into testimonials queue (status: pending, is_published: false).
   */
  public static async submitFeedback(
    userId: string | null,
    content: string,
    sourceEvent: string = 'general'
  ): Promise<TestimonialItem | null> {
    const supabase = createServiceRoleClient()
    const cleanContent = content.trim()
    if (!cleanContent) throw new Error('Feedback content cannot be empty.')

    const { data, error } = await supabase
      .from('testimonials')
      .insert({
        user_id: userId,
        content: cleanContent,
        source_event: sourceEvent,
        status: 'pending',
        is_published: false,
      })
      .select('*')
      .single()

    if (error || !data) {
      console.error('[FeedbackAdminService] Error submitting feedback:', error)
      return null
    }

    const row = data as TestimonialRow

    return {
      id: row.id,
      userId: row.user_id,
      authorName: 'Learner',
      authorRole: 'Product Management Student',
      sourceEvent: row.source_event,
      content: row.content,
      status: row.status as 'pending' | 'approved' | 'rejected',
      isPublished: row.is_published,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at,
      createdAt: row.created_at,
    }
  }

  /**
   * Fetches feedback moderation queue for Admin Console.
   */
  public static async getModerationQueue(statusFilter?: string): Promise<TestimonialItem[]> {
    const supabase = createServiceRoleClient()

    let query = supabase.from('testimonials').select('*').order('created_at', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error || !data) return []

    return this.toTestimonialItems(supabase, data as TestimonialRow[])
  }

  /**
   * One page of the testimonials queue (admin R6 B7).
   *
   * Filter (FeedbackModerationView): `status` is 'all', 'pending', 'approved' or
   * 'rejected'; absent or unknown -> 'all', the view's default. Exact `status` match;
   * newest first. The view has no search, so none is offered here.
   */
  public static async getModerationQueuePage(
    params: ModerationPageParams = {}
  ): Promise<ModerationPage<TestimonialItem>> {
    const { page, pageSize, from, to } = normalizeModerationPaging(params.page, params.pageSize)
    const status = normalizeModerationStatus(params.status, TESTIMONIAL_STATUS_FILTERS, 'all')
    const supabase = createServiceRoleClient()

    const build = () => {
      let query = supabase.from('testimonials').select('*', { count: 'exact' })
      if (status !== 'all') query = query.eq('status', status)
      return query.order('created_at', { ascending: false }).order('id', { ascending: false })
    }

    try {
      const { rows, total } = await runCountedPage<TestimonialRow>(
        () => build() as unknown as RangeableCountQuery,
        from,
        to
      )
      return { items: await this.toTestimonialItems(supabase, rows), total, page, pageSize, failed: false }
    } catch (err) {
      console.warn('[FeedbackAdminService] getModerationQueuePage failed:', err)
      return { items: [], total: 0, page, pageSize, failed: true }
    }
  }

  /**
   * Moderates a testimonial item (approve/edit/publish/reject).
   * Logs administrative action via logAdminAction().
   */
  public static async moderateTestimonial(
    adminUserId: string,
    adminEmail: string,
    testimonialId: string,
    action: 'approve' | 'publish' | 'unpublish' | 'reject' | 'edit',
    updatedContent?: string
  ): Promise<boolean> {
    const supabase = createServiceRoleClient()

    const updatePayload: Record<string, unknown> = {
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    }

    if (action === 'approve') {
      updatePayload.status = 'approved'
    } else if (action === 'publish') {
      updatePayload.status = 'approved'
      updatePayload.is_published = true
    } else if (action === 'unpublish') {
      updatePayload.is_published = false
    } else if (action === 'reject') {
      updatePayload.status = 'rejected'
      updatePayload.is_published = false
    }

    if (updatedContent && updatedContent.trim()) {
      updatePayload.content = updatedContent.trim()
    }

    const { error } = await supabase
      .from('testimonials')
      .update(updatePayload as import('@/lib/supabase').TablesUpdate<'testimonials'>)
      .eq('id', testimonialId)

    if (error) {
      console.error('[FeedbackAdminService] Error moderating testimonial:', error)
      return false
    }

    await logAdminAction(adminUserId, adminEmail, `testimonial_${action}`, 'testimonial', testimonialId, {
      action,
      updatedContent: updatedContent ? true : false,
    })

    try {
      (revalidateTag as unknown as (tag: string) => void)('testimonials')
    } catch {
      // Ignored outside request context
    }

    return true
  }

  /**
   * Fetches published testimonials for public Marketing site (GET /api/testimonials).
   */
  public static async getPublishedTestimonials(): Promise<Array<{ id: string; authorName: string; role: string; content: string; createdAt: string }>> {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return []
    }

    try {
      const fetcher = unstable_cache(
        async () => {
          try {
            const supabase = createServiceRoleClient()

            const { data, error } = await supabase
              .from('testimonials')
              .select('id, user_id, author_name, author_role, headline, rating, content, created_at')
              .eq('is_published', true)
              .eq('status', 'approved')
              .order('created_at', { ascending: false })

            if (error || !data) return []

            const rows = data as Array<{
              id: string
              user_id: string | null
              author_name?: string | null
              author_role?: string | null
              headline?: string | null
              rating?: number | null
              content: string
              created_at: string
            }>

            const userIds = rows.map((t) => t.user_id).filter(Boolean) as string[]
            const userMap = new Map<string, string>()

            if (userIds.length > 0) {
              const { data: usersData } = await supabase
                .from('users')
                .select('id, name, username, email')
                .in('id', userIds)

              if (usersData) {
                const uList = usersData as unknown as Array<{ id: string; name?: string | null; username?: string | null; email?: string | null }>
                uList.forEach((u) => {
                  userMap.set(u.id, u.name?.trim() || u.username?.trim() || (u.email ? u.email.split('@')[0] : '') || 'Learner')
                })
              }
            }

            return rows.map((t) => ({
              id: t.id,
              authorName: t.author_name || (t.user_id ? userMap.get(t.user_id) : null) || 'PM Academy Learner',
              role: t.author_role || 'Verified PM Academy Learner',
              content: t.content,
              createdAt: t.created_at,
            }))
          } catch {
            return []
          }
        },
        ['published-testimonials-v1'],
        // Next takes the MINIMUM of this and the revalidate of any page that awaits
        // it, so a 60s cache here silently pinned /reviews to 60s no matter what that
        // page declared. Kept in step with the page (1800s): both consumers are
        // public marketing surfaces showing admin-published testimonials, which change
        // rarely. The `testimonials` tag is retained so on-demand invalidation stays
        // available if it is ever wired up.
        { revalidate: 1800, tags: ['testimonials'] }
      )

      return await fetcher()
    } catch {
      return []
    }
  }

  /**
   * Fetches private product feedback items for Admin Console with author email resolution.
   */
  public static async getPrivateFeedbackList(): Promise<AdminPrivateFeedbackItem[]> {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('user_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !data) return []

    return this.toPrivateFeedbackItems(supabase, data as PrivateFeedbackRow[])
  }

  /**
   * One page of private product feedback (admin R6 B7).
   *
   * Filter: FeedbackListView has no filter today, so `status` defaults to 'all'; a known
   * status ('new', 'reviewed', 'planned', 'resolved', 'dismissed') is an exact match and
   * an unknown one falls back to 'all'. Newest first. No search, matching the view.
   */
  public static async getPrivateFeedbackPage(
    params: ModerationPageParams = {}
  ): Promise<ModerationPage<AdminPrivateFeedbackItem>> {
    const { page, pageSize, from, to } = normalizeModerationPaging(params.page, params.pageSize)
    const status = normalizeModerationStatus(params.status, PRIVATE_FEEDBACK_STATUS_FILTERS, 'all')
    const supabase = createServiceRoleClient()

    const build = () => {
      let query = supabase.from('user_feedback').select(PRIVATE_FEEDBACK_COLUMNS, { count: 'exact' })
      if (status !== 'all') query = query.eq('status', status)
      return query.order('created_at', { ascending: false }).order('id', { ascending: false })
    }

    try {
      const { rows, total } = await runCountedPage<PrivateFeedbackRow>(
        () => build() as unknown as RangeableCountQuery,
        from,
        to
      )
      return { items: await this.toPrivateFeedbackItems(supabase, rows), total, page, pageSize, failed: false }
    } catch (err) {
      console.warn('[FeedbackAdminService] getPrivateFeedbackPage failed:', err)
      return { items: [], total: 0, page, pageSize, failed: true }
    }
  }

  /**
   * Updates feedback status and records an audit log.
   */
  public static async updateFeedbackStatus(
    adminUserId: string,
    adminEmail: string,
    feedbackId: string,
    status: string
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createServiceRoleClient()
    const { error } = await (supabase
      .from('user_feedback') as unknown as DBChain)
      .update({ status })
      .eq('id', feedbackId)

    if (error) {
      console.error('[FeedbackAdminService] Error updating feedback status:', error)
      return { success: false, error: 'Failed to update feedback status.' }
    }

    await logAdminAction(adminUserId, adminEmail, `feedback_status_${status}`, 'feedback', feedbackId, { status })
    return { success: true }
  }
}

