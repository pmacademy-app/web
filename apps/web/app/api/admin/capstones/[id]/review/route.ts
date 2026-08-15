import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { ModerationService } from '@/lib/admin/moderation-service'

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params

    let body: { action?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
    }

    const { action } = body

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Valid action (approve, reject) is required.' },
        { status: 400 }
      )
    }

    const success = await ModerationService.reviewCapstone(
      auth.userId,
      auth.email,
      id,
      action as 'approve' | 'reject'
    )

    if (!success) {
      return NextResponse.json({ error: 'Failed to review capstone submission.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error reviewing capstone submission.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}