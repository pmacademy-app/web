import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { deleteAccount } from '@/lib/settings/settings-service'
import { verifyDestructiveReauth } from '@/lib/settings/destructive-reauth'
import { logSystemError } from '@/lib/monitoring/logger'

export const POST = withRoute(
  {
    actor: { allow: ['learner'] },
    operation: 'settings.delete_account',
    domain: 'api',
    summary: 'Unexpected failure while deleting a learner account',
  },
  async ({ request, actor }) => {
    const userId = requireUserId(actor)
    const body = await request.json().catch(() => ({}))

    const reauth = await verifyDestructiveReauth({
      actor,
      body,
      expectedPhrase: 'DELETE',
    })

    if (!reauth.ok) {
      return reauth.response
    }

    // Use service-role client for admin operations (bypasses RLS, has auth.admin access)
    const supabase = createServiceRoleClient()

    // 1. Delete the Supabase Auth user first. This is what stops the login working,
    //    and `public.users` plus every user-owned table cascade from it. If it fails,
    //    nothing has been touched and the learner is told, instead of being told
    //    "deleted" while the login still works.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'settings.delete_account_auth_user',
        message: `Auth user deletion failed: ${authDeleteError.message}`,
        userId,
        details: { error: authDeleteError.message },
      })
      throw new RouteError(500, 'ACCOUNT_DELETE_FAILED', 'We could not delete your account. Please try again.')
    }

    // 2. Clean up what does not cascade (avatar files in Storage). The account is
    //    already gone, so a failure here is recorded for follow-up, not returned:
    //    the learner cannot retry it, and the orphaned-avatar sweep is the backstop.
    try {
      await deleteAccount(supabase, userId)
    } catch (cleanupError) {
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'settings.delete_account_cleanup',
        message: `Post-deletion cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
        userId,
      })
    }

    // 3. Clear session cookies from the response so the browser is immediately logged out
    const response = NextResponse.json({ success: true })
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')
    return response
  }
)
