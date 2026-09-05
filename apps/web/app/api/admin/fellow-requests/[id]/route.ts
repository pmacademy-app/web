import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminUser } from '@/lib/admin/guard'
import { FellowRequestAdminService } from '@/lib/admin/fellow-request-service'

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
    const body = await request.json().catch(() => ({}))
    const { decision, rejectionReason } = body ?? {}

    if (decision !== 'approved' && decision !== 'rejected') {
      return NextResponse.json({ error: 'decision must be "approved" or "rejected".' }, { status: 400 })
    }

    const result = await FellowRequestAdminService.reviewRequest(
      auth.userId,
      auth.email,
      id,
      decision,
      typeof rejectionReason === 'string' ? rejectionReason : undefined
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to review Fellow request.' }, { status: 400 })
    }

    // The Fellow Requests queue lives inside the Moderation workspace (a tab,
    // not its own route) and approval also flips is_fellow on the user's
    // public portfolio/OG cache (handled inside toggleUserFellowStatus).
    revalidatePath('/admin/moderation')
    revalidatePath('/admin/users')

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to review Fellow request.'
    console.error('[API PATCH /api/admin/fellow-requests/[id]] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
