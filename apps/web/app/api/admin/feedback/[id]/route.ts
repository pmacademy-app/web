import { NextResponse } from 'next/server'
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
    const { action, updatedContent } = body

    if (!action || !['approve', 'publish', 'unpublish', 'reject', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'Valid action (approve, publish, unpublish, reject, edit) is required.' }, { status: 400 })
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

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error moderating testimonial.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
