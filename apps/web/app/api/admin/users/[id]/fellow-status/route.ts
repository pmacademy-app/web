import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'

interface Context {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminUser(request)
  if (!auth.authorized || !auth.userId || !auth.email) {
    return NextResponse.json({ error: auth.error || 'Admin privileges required' }, { status: auth.statusCode || 403 })
  }

  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const isFellow = typeof body.isFellow === 'boolean'
      ? body.isFellow
      : typeof body.makeFellow === 'boolean'
      ? body.makeFellow
      : null

    if (isFellow === null) {
      return NextResponse.json({ error: 'Missing or invalid isFellow boolean parameter' }, { status: 400 })
    }

    const success = await AdminConsoleService.toggleUserFellowStatus(id, isFellow)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update user fellow status' }, { status: 500 })
    }

    await logAdminAction(
      auth.userId,
      auth.email,
      isFellow ? 'grant_fellow_status' : 'revoke_fellow_status',
      'user',
      id,
      { isFellow }
    )

    revalidatePath('/admin/users')
    revalidatePath('/admin/moderation')
    revalidatePath('/admin/portfolios')
    revalidatePath('/admin')

    return NextResponse.json({ success: true, targetUserId: id, isFellow })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update fellow status'
    const isClientError = error instanceof Error && error.message.includes('Cannot verify a private portfolio')
    return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 })
  }
}

export async function PATCH(request: Request, context: Context) {
  return POST(request, context)
}
