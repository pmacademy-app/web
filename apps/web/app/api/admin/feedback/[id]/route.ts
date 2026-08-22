import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/admin/guard'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

interface Context {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    const body = await request.json()
    const { action, status, updatedContent } = body

    // 1. Direct feedback item status update (new, reviewed, planned, resolved, dismissed)
    if (action === 'update_status' || ['new', 'reviewed', 'planned', 'resolved', 'dismissed'].includes(status || action)) {
      const targetStatus = status || action
      const result = await FeedbackAdminService.updateFeedbackStatus(
        auth.userId,
        auth.email,
        id,
        targetStatus
      )

      if (!result.success) {
        return NextResponse.json({ error: result.error || 'Failed to update feedback status.' }, { status: 500 })
      }

      revalidatePath('/admin/feedback')
      revalidatePath('/admin/moderation')
      return NextResponse.json({ success: true, newStatus: targetStatus })
    }

    // 2. Testimonial moderation actions
    if (!action || !['approve', 'publish', 'unpublish', 'reject', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'Valid action is required.' }, { status: 400 })
    }

    const success = await FeedbackAdminService.moderateTestimonial(
      auth.userId,
      auth.email,
      id,
      action,
      updatedContent
    )

    if (!success) {
      return NextResponse.json({ error: 'Failed to update testimonial status.' }, { status: 500 })
    }

    revalidatePath('/admin/feedback')
    revalidatePath('/admin/moderation')
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error moderating feedback item.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

