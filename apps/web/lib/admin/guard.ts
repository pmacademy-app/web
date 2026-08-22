import { createServiceRoleClient } from '../supabase'
import { getAuthenticatedUserFromRequest } from '../auth'
import { isAdminEmail } from './authorization'

export interface AdminAuthResult {
  authorized: boolean
  userId?: string
  email?: string
  error?: string
  statusCode?: number
}

/**
 * Server-side authorization guard verifying whether the requesting user is an admin.
 * Enforces Role-Based Access Control (RBAC).
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

  const supabase = createServiceRoleClient()
  const { data: userRow, error } = await supabase
    .from('users')
    .select('is_admin, email')
    .eq('id', authUser.id)
    .single()

  const typedUserRow = userRow as unknown as { is_admin?: boolean; email: string } | null

  if (error || !typedUserRow) {
    await logAdminAction(authUser.id, authUser.email || 'unknown', 'access_denied', 'system', undefined, { reason: 'User record missing' })
    return {
      authorized: false,
      error: 'User account record not found',
      statusCode: 403,
    }
  }

  // Evaluate Admin authorization: ADMIN_EMAILS env var OR database users.is_admin = true
  const isEnvAdmin = isAdminEmail(typedUserRow.email)
  const isDbAdmin = Boolean(typedUserRow.is_admin)

  const isAuthorizedAdmin = isEnvAdmin || isDbAdmin

  if (!isAuthorizedAdmin) {
    await logAdminAction(authUser.id, typedUserRow.email, 'access_denied', 'system', undefined, { reason: 'Non-admin user' })
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

/**
 * Audit log helper for administrative actions.
 * Persists record to `admin_audit_logs` table via service-role client.
 * Non-blocking: failures are logged without throwing or failing the primary mutation.
 */
export async function logAdminAction(
  adminId: string,
  adminEmail: string,
  action: string,
  targetType: string,
  targetId?: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceRoleClient()
    await (supabase.from('admin_audit_logs') as unknown as { insert: (row: Record<string, unknown>) => Promise<{ error: unknown }> }).insert({
      admin_user_id: adminId,
      admin_email: adminEmail,
      action,
      target_resource: targetType,
      target_id: targetId || null,
      metadata: details || {},
    })
  } catch (error) {
    console.error(`[AdminAuditLog] Failed to persist audit log for ${action} by ${adminEmail}:`, error)
  }
}

