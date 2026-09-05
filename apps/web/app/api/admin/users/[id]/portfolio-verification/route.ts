import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'

interface Context {
  params: Promise<{ id: string }>
}

const VALID_OVERRIDES = ['verified', 'rejected', null]

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

    const body = await request.json().catch(() => ({}))
    const override = body.override === undefined ? undefined : body.override

    if (!VALID_OVERRIDES.includes(override)) {
      return NextResponse.json(
        { error: "override must be 'verified', 'rejected', or null (to restore automatic evaluation)." },
        { status: 400 }
      )
    }

    const success = await AdminConsoleService.setPortfolioVerificationOverride(id, override)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update portfolio verification status' }, { status: 500 })
    }

    await logAdminAction(
      auth.userId,
      auth.email,
      override === null ? 'reset_portfolio_verification' : `set_portfolio_verification_${override}`,
      'user',
      id,
      { override }
    )

    revalidatePath('/admin/users')
    revalidatePath('/admin/moderation')
    revalidatePath('/admin/portfolios')

    return NextResponse.json({ success: true, targetUserId: id, override })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update portfolio verification status'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
