import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { logSystemError } from '@/lib/monitoring/logger'
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
        throw new RouteError(404, 'NOT_FOUND', 'User not found')
      }

      return NextResponse.json({ user: userDetail })
    } catch (error: unknown) {
      if (error instanceof RouteError) throw error
      const message = adminErrorMessage(error, 'Failed to fetch user details.')
      throw new RouteError(500, 'USER_DETAIL_FETCH_FAILED', message)
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

      // 1. Guard against self-deletion
      if (id === admin.userId) {
        return NextResponse.json(
          { error: 'Admins cannot delete their own account through the admin panel.' },
          { status: 400 }
        )
      }

      // 2. Fetch target user to check existence and admin hierarchy
      const { data: targetUser, error: targetErr } = await supabase
        .from('users')
        .select('id, email, is_admin')
        .eq('id', id)
        .maybeSingle()

      if (targetErr || !targetUser) {
        throw new RouteError(404, 'NOT_FOUND', 'User not found.')
      }

      // 3. Admin protection: no administrator account can be deleted through the API.
      // An admin must be demoted (users.is_admin = false) before the account can be removed.
      if (targetUser.is_admin === true) {
        throw new RouteError(
          403,
          'FORBIDDEN',
          'Administrators cannot be deleted. Remove their admin access first.'
        )
      }

      // 4. Delete the GoTrue auth user first. public.users cascades from auth.users, so a
      // failure here must stop the request before any data is touched (no zombie logins).
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id)
      if (authDeleteError) {
        void logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'admin.users.delete_auth_user',
          message: `Auth user deletion failed for ${id}: ${authDeleteError.message}`,
          userId: id,
          details: { error: authDeleteError.message },
        })
        throw new RouteError(500, 'ACCOUNT_DELETE_FAILED', 'Could not delete the account. Nothing was removed.')
      }

      // 5. Leftover cleanup the cascade does not cover (avatar files). The login is already gone,
      // so a cleanup failure is logged, not returned: the orphaned-avatar sweep is the backstop.
      try {
        await deleteAccount(supabase, id)
      } catch (cleanupError) {
        void logSystemError({
          severity: 'error',
          category: 'auth',
          operation: 'admin.users.delete_cleanup',
          message: `Post-deletion cleanup failed for ${id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
          userId: id,
        })
      }

      await logAdminAction(admin.userId, admin.email, 'admin_user_deleted', 'user', id, {
        targetEmail: targetUser.email,
        authDeleted: true,
      })

      revalidatePath('/admin/users')
      revalidatePath('/academy', 'layout')
      revalidatePath('/dashboard', 'layout')

      return NextResponse.json({
        success: true,
        deletedUserId: id,
        authDeleted: true,
      })
} catch (error: unknown) {
      if (error instanceof RouteError) throw error
      const message = adminErrorMessage(error, 'Failed to delete user account.')
      throw new RouteError(500, 'DELETE_USER_FAILED', message)
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
          throw new RouteError(400, 'INVALID_INPUT', 'moduleSlug is required for reset_module action.')
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
          throw new RouteError(500, 'UPDATE_FELLOW_STATUS_FAILED', 'Failed to update fellow status.')
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

      throw new RouteError(400, 'INVALID_INPUT', 'Invalid admin action')
    } catch (error: unknown) {
      if (error instanceof RouteError) throw error
      const message = adminErrorMessage(error, 'Failed to execute admin action.')
      throw new RouteError(500, 'EXECUTE_ADMIN_ACTION_FAILED', message)
    }
  }
)
