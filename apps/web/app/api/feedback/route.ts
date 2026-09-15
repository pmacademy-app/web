import { NextResponse } from 'next/server'

import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * Deliberately open to `anonymous` — feedback is collected from signed-out visitors
 * too, and the row simply carries a null `user_id`.
 *
 * The bucket keeps its pre-migration shape exactly: per-learner when signed in, and
 * one shared `anon_feedback` bucket otherwise. A shared anonymous bucket is a
 * stricter ceiling than a per-IP one, so it is preserved rather than "improved".
 * The rule is declared on the wrapper and no body schema is, which keeps the
 * original order — authenticate, throttle, then parse.
 */
export const POST = withRoute(
  {
    actor: { allow: ['learner', 'anonymous'] },
    operation: 'feedback.submit',
    summary: 'Unexpected failure recording learner feedback',
    errorMessage: 'Error submitting feedback.',
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'learner' ? actor.userId : 'anon_feedback'),
        limit: 5,
        windowMs: 60 * 1000,
      },
    ],
  },
  async ({ request, actor }) => {
    const userId = actor.kind === 'learner' ? actor.userId : null

    const body = (await request.json()) as Record<string, unknown>
    const { content, category, sourceEvent, rating, pageUrl, promptKey, action } = body

    const supabase = createServiceRoleClient()

    // Handle prompt dismissal without content
    if (action === 'dismiss' && promptKey && userId) {
      await supabase.from('user_feedback_prompts')
        .upsert({
          user_id: userId,
          prompt_key: String(promptKey),
          action: 'dismissed',
        })

      return NextResponse.json({ success: true, dismissed: true })
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new RouteError(400, 'VALIDATION', 'Feedback content is required.')
    }

    const cleanContent = content.trim().substring(0, 3000)
    const cleanCategory = typeof category === 'string' ? category.trim().substring(0, 50) : 'general'
    const cleanSource = typeof sourceEvent === 'string' ? sourceEvent.trim().substring(0, 50) : 'manual'
    const cleanRating = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : null
    const cleanUrl = typeof pageUrl === 'string' ? pageUrl.trim().substring(0, 200) : null

    const { data, error } = await supabase
      .from('user_feedback')
      .insert({
        user_id: userId,
        category: cleanCategory,
        source_event: cleanSource,
        content: cleanContent,
        rating: cleanRating,
        page_url: cleanUrl,
        status: 'new',
      })
      .select('id, created_at')
      .single()

    if (error || !data) {
      console.error('[api/feedback] Error inserting private feedback:', error)
      throw new RouteError(500, 'SERVER_ERROR', 'Failed to record feedback.')
    }

    // Record prompt key submission if prompted
    if (promptKey && userId) {
      await supabase.from('user_feedback_prompts')
        .upsert({
          user_id: userId,
          prompt_key: String(promptKey),
          action: 'submitted',
        })
    }

    return NextResponse.json({ success: true, feedbackId: data.id })
  }
)
