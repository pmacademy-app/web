import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { requireUserId } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
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

    // 1. Delete all application-owned data rows (cascades through all user tables)
    await deleteAccount(supabase, userId)

    // 2. Permanently delete the Supabase Auth user: this is the critical step that
    //    prevents the user from logging in again. Requires service_role key.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId)
    if (authDeleteError) {
      void logSystemError({
        severity: 'error',
        category: 'auth',
        operation: 'settings.delete_account_auth_user',
        message: `Auth user deletion failed for ${userId}: ${authDeleteError.message}`,
        userId,
        details: { error: authDeleteError.message },
      })
    }

    // 3. Clear session cookies from the response so the browser is immediately logged out
    const response = NextResponse.json({ success: true })
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')
    return response
  }
)
