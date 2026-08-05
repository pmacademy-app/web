import { NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'

/**
 * Verifies whether the current session holds admin authorization.
 *
 * Used by the admin login page immediately after sign-in to decide between
 * entering the console (/admin) or showing the access denied page. The check
 * runs the full server-side RBAC guard (ADMIN_EMAILS OR users.is_admin) and is
 * audit-logged on denial.
 */
export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)

  return NextResponse.json({
    authorized: authGuard.authorized,
    email: authGuard.email ?? null,
    reason: authGuard.authorized ? null : (authGuard.error ?? 'Unauthorized'),
  })
}
