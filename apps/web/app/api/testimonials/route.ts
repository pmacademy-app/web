import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServerSupabaseClient } from '@/lib/supabase'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { evaluateRateLimit } from '@/lib/rate-limit'

export async function GET() {
  try {
    const testimonials = await FeedbackAdminService.getPublishedTestimonials()
    return NextResponse.json({ testimonials })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch testimonials.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to submit a review.' }, { status: 401 })
    }

    const rateCheck = evaluateRateLimit(`testimonial_${user.id}`, { limit: 3, windowMs: 15 * 60 * 1000 })
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many review submissions. Please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const { content, rating, headline, authorName, authorRole, allowPublicFeature } = body

    if (!allowPublicFeature) {
      return NextResponse.json({ error: 'Explicit opt-in permission is required for public testimonial submissions.' }, { status: 400 })
    }

    if (!authorName || typeof authorName !== 'string' || !authorName.trim()) {
      return NextResponse.json({ error: 'Your name is required for public review submissions.' }, { status: 400 })
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Review content is required.' }, { status: 400 })
    }

    const cleanAuthorName = authorName.trim().substring(0, 100)
    const cleanContent = content.trim().substring(0, 1500)
    const cleanRating = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : 5
    const cleanHeadline = typeof headline === 'string' ? headline.trim().substring(0, 150) : null
    const cleanRole = typeof authorRole === 'string' ? authorRole.trim().substring(0, 100) : 'PM Academy Learner'

    const supabase = createServerSupabaseClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('testimonials' as any) as any)
      .insert({
        user_id: user.id,
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
      return NextResponse.json({ error: 'Failed to submit review for moderation.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, testimonialId: data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error submitting review.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
