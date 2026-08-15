import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { parseUserFilters } from '@/lib/admin/users-aggregation'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25))
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const filters = parseUserFilters(Object.fromEntries(searchParams.entries()))

  try {
    const { users, total, failed } = await AdminConsoleService.getUsersOverview(limit, search, filters, page)
    if (failed) {
      return NextResponse.json({ success: false, error: 'Failed to fetch users' }, { status: 500 })
    }
    return NextResponse.json({ success: true, count: users.length, total, users })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch users'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const body = await request.json()
    const { targetUserId, makeAdmin } = body as { targetUserId: string; makeAdmin: boolean }

    if (!targetUserId || typeof makeAdmin !== 'boolean') {
      return NextResponse.json({ error: 'Missing targetUserId or makeAdmin parameters' }, { status: 400 })
    }

    const success = await AdminConsoleService.toggleUserAdminRole(targetUserId, makeAdmin)
    if (!success) {
      return NextResponse.json({ error: 'Failed to update user admin status' }, { status: 500 })
    }

    await logAdminAction(
      authGuard.userId!,
      authGuard.email!,
      makeAdmin ? 'grant_admin_role' : 'revoke_admin_role',
      'user',
      targetUserId
    )

    return NextResponse.json({ success: true, targetUserId, makeAdmin })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update user role'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
