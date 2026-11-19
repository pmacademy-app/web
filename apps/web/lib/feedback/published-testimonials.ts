import { unstable_cache } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * Read side of testimonials for the public marketing surfaces (/reviews, the homepage
 * section and GET /api/testimonials). Moderation (approve, publish, reject) lives in the
 * admin console repository, which asks this app to drop the `testimonials` cache tag
 * through POST /api/internal/revalidate after a change.
 */

/** Cache tag on the published-testimonials read. */
export const TESTIMONIALS_CACHE_TAG = 'testimonials'

export interface PublishedTestimonial {
  id: string
  authorName: string
  role: string
  content: string
  createdAt: string
}

export class TestimonialsService {
  /**
   * Fetches published testimonials for public Marketing site (GET /api/testimonials).
   */
  public static async getPublishedTestimonials(): Promise<PublishedTestimonial[]> {
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
              authorName: t.author_name || (t.user_id ? userMap.get(t.user_id) : null) || 'Prodily Learner',
              role: t.author_role || 'Prodily Learner',
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
        // rarely. The admin console invalidates the tag on demand through
        // POST /api/internal/revalidate.
        { revalidate: 1800, tags: [TESTIMONIALS_CACHE_TAG] }
      )

      return await fetcher()
    } catch {
      return []
    }
  }
}
