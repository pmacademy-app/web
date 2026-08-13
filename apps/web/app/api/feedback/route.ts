import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase'
import { evaluateRateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    const rateCheck = await evaluateRateLimit(user ? user.id : 'anon_feedback', { limit: 5, windowMs: 60 * 1000 })
    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many feedback submissions. Please wait a moment.' }, { status: 429 })
    }

    const body = await request.json()
    const { content, category, sourceEvent, rating, pageUrl, promptKey, action } = body

    // Handle prompt dismissal without content
    if (action === 'dismiss' && promptKey && user) {
      const supabase = createServiceRoleClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('user_feedback_prompts' as any) as any)
        .upsert({
          user_id: user.id,
          prompt_key: String(promptKey),
          action: 'dismissed',
        })

      return NextResponse.json({ success: true, dismissed: true })
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Feedback content is required.' }, { status: 400 })
    }

    const cleanContent = content.trim().substring(0, 3000)
    const cleanCategory = typeof category === 'string' ? category.trim().substring(0, 50) : 'general'
    const cleanSource = typeof sourceEvent === 'string' ? sourceEvent.trim().substring(0, 50) : 'manual'
    const cleanRating = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : null
    const cleanUrl = typeof pageUrl === 'string' ? pageUrl.trim().substring(0, 200) : null

    const supabase = createServiceRoleClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('user_feedback' as any) as any)
      .insert({
        user_id: user ? user.id : null,
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
      return NextResponse.json({ error: 'Failed to record feedback.' }, { status: 500 })
    }

    // Record prompt key submission if prompted
    if (promptKey && user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('user_feedback_prompts' as any) as any)
        .upsert({
          user_id: user.id,
          prompt_key: String(promptKey),
          action: 'submitted',
        })
    }

    return NextResponse.json({ success: true, feedbackId: data.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error submitting feedback.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
