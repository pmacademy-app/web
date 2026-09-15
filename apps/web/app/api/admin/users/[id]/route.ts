import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { deleteAccount, resetProgress } from '@/lib/settings/settings-service'
import { createServiceRoleClient } from '@/lib/supabase'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.id.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/users/[id]',
  },
  async ({ params }) => {
    try {
      const { id } = params
      const userDetail = await AdminConsoleService.getUserDetailData(id)

      if (!userDetail) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      return NextResponse.json({ user: userDetail })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to fetch user details.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)

export const DELETE = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.id.delete',
    domain: 'admin',
    summary: 'Unexpected failure in DELETE /api/admin/users/[id]',
  },
  async ({ actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const supabase = createServiceRoleClient()

      await deleteAccount(supabase, id)
      await logAdminAction(admin.userId, admin.email, 'admin_user_deleted', 'user', id)

      revalidatePath('/admin/users')
      revalidatePath('/academy', 'layout')
      revalidatePath('/dashboard', 'layout')

      return NextResponse.json({ success: true, deletedUserId: id })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to delete user account.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.id.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/users/[id]',
  },
  async ({ request, actor, params }) => {
    const admin = requireAdmin(actor)
    try {
      const { id } = params
      const body = await request.json()
      const { action } = body

      const supabase = createServiceRoleClient()

      if (action === 'reset_progress') {
        await resetProgress(supabase, id, 'all')
        await logAdminAction(admin.userId, admin.email, 'admin_reset_progress', 'user', id, { scope: 'all' })

        revalidatePath('/admin/users')
        revalidatePath('/academy', 'layout')
        revalidatePath('/dashboard', 'layout')
        revalidatePath('/progress', 'layout')
        revalidatePath('/capstones', 'layout')

        return NextResponse.json({ success: true, resetUserId: id, scope: 'all' })
      }

      if (action === 'reset_module') {
        const moduleSlug = body.moduleSlug || body.module
        if (!moduleSlug) {
          return NextResponse.json({ error: 'moduleSlug is required for reset_module action.' }, { status: 400 })
        }

        await resetProgress(supabase, id, moduleSlug)
        await logAdminAction(admin.userId, admin.email, 'admin_reset_module', 'user', id, { moduleSlug })

        revalidatePath('/admin/users')
        revalidatePath('/academy', 'layout')
        revalidatePath('/dashboard', 'layout')
        revalidatePath('/progress', 'layout')
        revalidatePath('/capstones', 'layout')

        return NextResponse.json({ success: true, resetUserId: id, moduleSlug })
      }

      if (action === 'set_fellow_status') {
        const isFellow = typeof body.isFellow === 'boolean' ? body.isFellow : Boolean(body.makeFellow)
        const success = await AdminConsoleService.toggleUserFellowStatus(id, isFellow)
        if (!success) {
          return NextResponse.json({ error: 'Failed to update fellow status.' }, { status: 500 })
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
        return NextResponse.json({ success: true, targetUserId: id, isFellow })
      }

      return NextResponse.json({ error: 'Invalid admin action' }, { status: 400 })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to execute admin action.')
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
