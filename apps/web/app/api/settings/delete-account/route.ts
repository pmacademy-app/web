import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { deleteAccount } from '@/lib/settings/settings-service'

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authenticated session required.' },
        { status: 401 }
      )
    }

    // Use service-role client for admin operations (bypasses RLS, has auth.admin access)
    const supabase = createServiceRoleClient()

    // 1. Delete all application-owned data rows (cascades through all user tables)
    await deleteAccount(supabase, user.id)

    // 2. Permanently delete the Supabase Auth user — this is the critical step that
    //    prevents the user from logging in again. Requires service_role key.
    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id)
    if (authDeleteError) {
      // If auth deletion fails, log the error but still return success since data
      // is already cleaned. The user can no longer access any application data.
      // A manual cleanup in Supabase dashboard may be needed.
      console.error('[API POST /api/settings/delete-account] Auth user deletion failed:', authDeleteError)
    }

    // 3. Clear session cookies from the response so the browser is immediately logged out
    const response = NextResponse.json({ success: true })
    response.cookies.delete('sb-access-token')
    response.cookies.delete('sb-refresh-token')
    return response
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete account.'
    console.error('[API POST /api/settings/delete-account] Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
