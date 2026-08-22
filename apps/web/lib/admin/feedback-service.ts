import { unstable_cache, revalidateTag } from 'next/cache'
import { createServiceRoleClient } from '../supabase'
import { logAdminAction } from './guard'

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

export class FeedbackAdminService {
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

    const rows = data as TestimonialRow[]

    // Fetch user profiles for author attribution
    const userIds = rows.map((t) => t.user_id).filter(Boolean) as string[]
    const userMap = new Map<string, { name: string; username: string }>()

    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, full_name, username, email')
        .in('id', userIds)

      if (usersData) {
        const uList = usersData as unknown as Array<{ id: string; full_name?: string; username?: string; email: string }>
        uList.forEach((u) => {
          userMap.set(u.id, {
            name: u.full_name || u.username || u.email.split('@')[0],
            username: u.username || `user_${u.id.substring(0, 6)}`,
          })
        })
      }
    }

    return rows.map((item) => {
      const itemExt = item as unknown as TestimonialRow & { author_name?: string; author_role?: string }
      const userMeta = item.user_id ? userMap.get(item.user_id) : null
      return {
        id: item.id,
        userId: item.user_id,
        authorName: itemExt.author_name || userMeta?.name || 'PM Academy Learner',
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
      revalidateTag('testimonials', 'default')
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
                .select('id, full_name, username, email')
                .in('id', userIds)

              if (usersData) {
                const uList = usersData as unknown as Array<{ id: string; full_name?: string; username?: string; email: string }>
                uList.forEach((u) => {
                  userMap.set(u.id, u.full_name || u.username || 'Learner')
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
        { revalidate: 60, tags: ['testimonials'] }
      )

      return await fetcher()
    } catch {
      return []
    }
  }

  /**
   * Fetches private product feedback items for Admin Console with author email resolution.
   */
  public static async getPrivateFeedbackList(): Promise<Array<{
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
  }>> {
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('user_feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !data) return []

    type FeedbackRow = {
      id: string
      user_id: string | null
      category: string
      source_event: string
      content: string
      rating: number | null
      status: string
      created_at: string
    }

    const rows = data as FeedbackRow[]
    const userIds = rows.map((f) => f.user_id).filter(Boolean) as string[]
    const userMap = new Map<string, { name: string; email: string }>()

    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, full_name, username, email')
        .in('id', userIds)

      if (usersData) {
        const uList = usersData as unknown as Array<{ id: string; name?: string; full_name?: string; username?: string; email: string }>
        uList.forEach((u) => {
          userMap.set(u.id, {
            name: u.name || u.full_name || u.username || u.email.split('@')[0],
            email: u.email,
          })
        })
      }
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
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', feedbackId)

    if (error) {
      console.error('[FeedbackAdminService] Error updating feedback status:', error)
      return { success: false, error: 'Failed to update feedback status.' }
    }

    await logAdminAction(adminUserId, adminEmail, `feedback_status_${status}`, 'feedback', feedbackId, { status })
    return { success: true }
  }
}

