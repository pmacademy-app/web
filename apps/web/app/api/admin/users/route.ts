import { NextResponse } from 'next/server'

import { logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { parseUserFilters } from '@/lib/admin/users-aggregation'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/users',
  },
  async ({ request }) => {
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
      const message = adminErrorMessage(err, 'Failed to fetch users')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)

export const PATCH = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.users.patch',
    domain: 'admin',
    summary: 'Unexpected failure in PATCH /api/admin/users',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)
    try {
      const body = await request.json()
      const { targetUserId, makeAdmin } = body as { targetUserId: string; makeAdmin: boolean }

      if (!targetUserId || typeof makeAdmin !== 'boolean') {
        return NextResponse.json({ error: 'Missing targetUserId or makeAdmin parameters' }, { status: 400 })
      }

      // Lockout guard 1: an admin cannot remove their own admin access. Another admin
      // has to do it, so the console always keeps at least the person acting on it.
      if (!makeAdmin && targetUserId === admin.userId) {
        return NextResponse.json(
          { error: 'You cannot remove your own admin access. Ask another administrator.' },
          { status: 400 }
        )
      }

      // Lockout guard 2 (inside the service): refuse a demotion that would leave zero
      // admins. See toggleUserAdminRole for the residual race between two demotions.
      const outcome = await AdminConsoleService.toggleUserAdminRole(targetUserId, makeAdmin)
      if (outcome === 'not_found') {
        return NextResponse.json({ error: 'User not found.' }, { status: 404 })
      }
      if (outcome === 'last_admin') {
        return NextResponse.json(
          { error: 'This is the last administrator. Promote another admin before removing this one.' },
          { status: 409 }
        )
      }
      if (outcome !== 'updated') {
        return NextResponse.json({ error: 'Failed to update user admin status' }, { status: 500 })
      }

      await logAdminAction(
        admin.userId,
        admin.email,
        makeAdmin ? 'grant_admin_role' : 'revoke_admin_role',
        'user',
        targetUserId,
        { makeAdmin }
      )

      return NextResponse.json({ success: true, targetUserId, makeAdmin })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update user role')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
