import { createServerSupabaseClient } from '../supabase'
import { getAuthenticatedUserFromRequest } from '../auth'

export interface AdminAuthResult {
  authorized: boolean
  userId?: string
  email?: string
  error?: string
  statusCode?: number
}

/**
 * Server-side authorization guard verifying whether the requesting user is an admin.
 */
export async function requireAdminUser(request: Request): Promise<AdminAuthResult> {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return {
      authorized: false,
      error: 'Authentication required',
      statusCode: 401,
    }
  }

  const supabase = createServerSupabaseClient()
  const { data: userRow, error } = await supabase
    .from('users')
    .select('is_admin, email')
    .eq('id', authUser.id)
    .single()

  const typedUserRow = userRow as unknown as { is_admin?: boolean; email: string } | null

  if (error || !typedUserRow) {
    return {
      authorized: false,
      error: 'User account record not found',
      statusCode: 403,
    }
  }

  if (!typedUserRow.is_admin) {
    return {
      authorized: false,
      error: 'Access denied: Admin privileges required',
      statusCode: 403,
    }
  }

  return {
    authorized: true,
    userId: authUser.id,
    email: typedUserRow.email,
  }
}
