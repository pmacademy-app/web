import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

const VALID_OVERRIDES = ['verified', 'rejected', null]

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.id.portfolio_verification.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/users/[id]/portfolio-verification',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
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
        admin.userId,
        admin.email,
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
      const message = adminErrorMessage(error, 'Failed to update portfolio verification status')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
