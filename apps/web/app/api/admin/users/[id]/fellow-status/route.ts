import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.id.fellow_status.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/users/[id]/fellow-status',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
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
        admin.userId,
        admin.email,
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
      const message = adminErrorMessage(error, 'Failed to update fellow status')
      const isClientError = error instanceof Error && error.message.includes('Cannot verify a private portfolio')
      return NextResponse.json({ error: message }, { status: isClientError ? 400 : 500 })
    }
  }
)

/** The console calls this with either verb; both are the same operation. */
export const PATCH = POST
