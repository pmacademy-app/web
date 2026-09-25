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

export interface RequireAdminOptions {
  silent?: boolean
}

interface CachedAdminAuth {
  result: AdminAuthResult
  loggedAudit: boolean
  userId?: string
  userEmail?: string
}

const adminGuardCache = new WeakMap<Request, CachedAdminAuth>()

/**
 * Internal resolver for server-side authorization guard verifying admin status.
 */
async function resolveRequireAdminUser(
  request: Request,
  options?: RequireAdminOptions
): Promise<CachedAdminAuth> {
  const authUser = await getAuthenticatedUserFromRequest(request)
  if (!authUser) {
    return {
      result: {
        authorized: false,
        error: 'Authentication required',
        statusCode: 401,
      },
      loggedAudit: false,
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
    if (!options?.silent) {
      await logAdminAction(authUser.id, authUser.email || 'unknown', 'access_denied', 'system', undefined, { reason: 'User record missing' })
    }
    return {
      result: {
        authorized: false,
        error: 'User account record not found',
        statusCode: 403,
      },
      loggedAudit: !options?.silent,
      userId: authUser.id,
      userEmail: authUser.email || 'unknown',
    }
  }

  // Evaluate Admin authorization: ADMIN_EMAILS env var OR database users.is_admin = true
  const isEnvAdmin = isAdminEmail(typedUserRow.email)
  const isDbAdmin = Boolean(typedUserRow.is_admin)

  const isAuthorizedAdmin = isEnvAdmin || isDbAdmin

  if (!isAuthorizedAdmin) {
    if (!options?.silent) {
      await logAdminAction(authUser.id, typedUserRow.email, 'access_denied', 'system', undefined, { reason: 'Non-admin user' })
    }
    return {
      result: {
        authorized: false,
        error: 'Access denied: Admin privileges required',
        statusCode: 403,
      },
      loggedAudit: !options?.silent,
      userId: authUser.id,
      userEmail: typedUserRow.email,
    }
  }

  return {
    result: {
      authorized: true,
      userId: authUser.id,
      email: typedUserRow.email,
    },
    loggedAudit: false,
    userId: authUser.id,
    userEmail: typedUserRow.email,
  }
}

/**
 * Server-side authorization guard verifying whether the requesting user is an admin.
 * Deduplicated per request instance using WeakMap.
 */
export async function requireAdminUser(
  request: Request,
  options?: RequireAdminOptions
): Promise<AdminAuthResult> {
  const cached = adminGuardCache.get(request)
  if (cached) {
    // If this call explicitly wants auditing and the cached denial was silent, emit the audit log now
    if (!options?.silent && !cached.result.authorized && !cached.loggedAudit && cached.userId) {
      cached.loggedAudit = true
      await logAdminAction(
        cached.userId,
        cached.userEmail || 'unknown',
        'access_denied',
        'system',
        undefined,
        { reason: 'Non-admin user' }
      )
    }
    return cached.result
  }

  const cachedAuth = await resolveRequireAdminUser(request, options)
  adminGuardCache.set(request, cachedAuth)
  return cachedAuth.result
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

