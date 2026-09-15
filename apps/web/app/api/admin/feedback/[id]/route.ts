import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { FeedbackAdminService } from '@/lib/admin/feedback-service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.feedback.id.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/feedback/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const body = await request.json()
      const { action, status, updatedContent } = body

      // 1. Direct feedback item status update (new, reviewed, planned, resolved, dismissed)
      if (action === 'update_status' || ['new', 'reviewed', 'planned', 'resolved', 'dismissed'].includes(status || action)) {
        const targetStatus = status || action
        const result = await FeedbackAdminService.updateFeedbackStatus(
          admin.userId,
          admin.email,
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
        admin.userId,
        admin.email,
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
      const message = adminErrorMessage(error, 'Error moderating feedback item.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
