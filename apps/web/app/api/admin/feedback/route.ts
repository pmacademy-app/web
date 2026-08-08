import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { FeedbackAdminService } from '@/lib/admin/feedback-service'

export async function GET(request: Request) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const statusFilter = searchParams.get('status') || undefined

    const queue = await FeedbackAdminService.getModerationQueue(statusFilter)
    return NextResponse.json({ queue })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch moderation queue.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
