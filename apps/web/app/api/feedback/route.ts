import { NextResponse } from 'next/server'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    const body = await request.json()

    const { content, sourceEvent } = body
    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ error: 'Feedback content is required.' }, { status: 400 })
    }

    const result = await FeedbackAdminService.submitFeedback(
      user ? user.id : null,
      content,
      sourceEvent || 'general'
    )

    if (!result) {
      return NextResponse.json({ error: 'Failed to submit feedback.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, feedback: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error submitting feedback.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
