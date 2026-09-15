import { NextResponse } from 'next/server'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

/** Published testimonials are marketing copy on the public site. */
export const GET = withRoute(
  {
    actor: { allow: ['anonymous', 'learner'] },
    operation: 'testimonials.published.read',
    summary: 'Unexpected failure fetching published testimonials',
    errorMessage: 'Failed to fetch testimonials.',
  },
  async () => {
    const testimonials = await FeedbackAdminService.getPublishedTestimonials()
    return NextResponse.json({ testimonials })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'testimonials.submit',
    summary: 'Unexpected failure submitting a testimonial',
    errorMessage: 'Error submitting review.',
    // 3 per 15 minutes per learner, as before. Declared on the wrapper with no body
    // schema, which keeps the original order — throttle, then read the body.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? `testimonial_${actor.userId}` : null),
        limit: 3,
        windowMs: 15 * 60 * 1000,
      },
    ],
  },
  async ({ request, actor }) => {
    const body = (await request.json()) as Record<string, unknown>
    const { content, rating, headline, authorName, authorRole, allowPublicFeature } = body

    if (!allowPublicFeature) {
      throw new RouteError(400, 'VALIDATION', 'Explicit opt-in permission is required for public testimonial submissions.')
    }

    if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
      throw new RouteError(400, 'VALIDATION', 'Your name is required for public review submissions.')
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new RouteError(400, 'VALIDATION', 'Review content is required.')
    }

    const cleanAuthorName = authorName.trim().substring(0, 100)
    const cleanContent = content.trim().substring(0, 1500)
    const cleanRating = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : 5
    const cleanHeadline = typeof headline === 'string' ? headline.trim().substring(0, 150) : null
    const cleanRole = typeof authorRole === 'string' ? authorRole.trim().substring(0, 100) : 'PM Academy Learner'

    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('testimonials')
      .insert({
        user_id: requireUserId(actor),
        source_event: 'user_submitted',
        author_name: cleanAuthorName,
        content: cleanContent,
        rating: cleanRating,
        headline: cleanHeadline,
        author_role: cleanRole,
        status: 'pending',
        is_published: false,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[api/testimonials] Error inserting testimonial review:', error)
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to submit review for moderation.')
    }

    return NextResponse.json({ success: true, testimonialId: data.id })
  }
)
