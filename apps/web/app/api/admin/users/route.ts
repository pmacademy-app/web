import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { logAdminAction, logAdminActionStrict } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { parseUserFilters } from '@/lib/admin/users-aggregation'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { evaluatePersistentRateLimit } from '@/lib/rate-limit'
import { createServiceRoleClient } from '@/lib/supabase'

/** Password re-checks for an admin grant: 5 per admin per 15 minutes, fail closed. */
const STEP_UP_LIMIT = { windowMs: 15 * 60 * 1000, limit: 5, failClosed: true }

/**
 * Step-up re-authentication for granting admin (L8): the acting admin's current password,
 * checked on a session-less anon client (the pattern Settings > Security uses). The session
 * that check mints is revoked straight away, so the check leaves nothing signed in.
 */
async function verifyAdminPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return false
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data?.session) return false
  try {
    await createServiceRoleClient().auth.admin.signOut(data.session.access_token, 'local')
  } catch {
    // Best effort: the check itself already succeeded.
  }
  return true
}

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
      const { targetUserId, makeAdmin, currentPassword } = body as {
        targetUserId: string
        makeAdmin: boolean
        currentPassword?: unknown
      }

      if (!targetUserId || typeof targetUserId !== 'string' || typeof makeAdmin !== 'boolean') {
        return NextResponse.json({ error: 'Missing targetUserId or makeAdmin parameters' }, { status: 400 })
      }

      // L8 step-up: granting admin is the most powerful write in the console, so a stolen
      // or unattended admin session alone is not enough. Demotion needs no step-up.
      if (makeAdmin) {
        if (typeof currentPassword !== 'string' || currentPassword.length === 0 || currentPassword.length > 256) {
          return NextResponse.json(
            { error: 'Enter your current password to grant admin access.', code: 'STEP_UP_REQUIRED' },
            { status: 400 }
          )
        }
        const limit = await evaluatePersistentRateLimit(`admin_grant_stepup_${admin.userId}`, STEP_UP_LIMIT)
        if (!limit.success) {
          return NextResponse.json(
            { error: 'Too many attempts. Please wait a while before trying again.', code: 'RATE_LIMITED' },
            { status: 429 }
          )
        }
        if (!admin.email || !(await verifyAdminPassword(admin.email, currentPassword))) {
          return NextResponse.json(
            { error: 'Your current password is incorrect.', code: 'STEP_UP_FAILED' },
            { status: 403 }
          )
        }
      }

      // Whether the target was already an admin, so a failed grant audit below only ever
      // undoes a promotion this request made.
      let wasAdmin = false
      if (makeAdmin) {
        const { data: prior, error: priorError } = await createServiceRoleClient()
          .from('users')
          .select('id, is_admin')
          .eq('id', targetUserId)
          .maybeSingle()
        if (priorError) {
          return NextResponse.json({ error: 'Failed to update user admin status' }, { status: 500 })
        }
        wasAdmin = (prior as { is_admin?: boolean | null } | null)?.is_admin === true
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

      if (makeAdmin) {
        // L8: a grant must not stand unrecorded. If the audit row cannot be written, the
        // grant is undone (demoting the user just promoted cannot hit the last-admin guard).
        const audited = await logAdminActionStrict(
          admin.userId,
          admin.email,
          'grant_admin_role',
          'user',
          targetUserId,
          { makeAdmin, stepUp: 'password' }
        )
        if (!audited) {
          const reverted = wasAdmin ? 'not_needed' : await AdminConsoleService.toggleUserAdminRole(targetUserId, false)
          console.error('[admin/users] Admin grant reverted: audit log write failed', { targetUserId, reverted })
          return NextResponse.json(
            { error: 'Could not record this change, so it was not applied. Please try again.' },
            { status: 500 }
          )
        }
      } else {
        await logAdminAction(admin.userId, admin.email, 'revoke_admin_role', 'user', targetUserId, { makeAdmin })
      }

      return NextResponse.json({ success: true, targetUserId, makeAdmin })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update user role')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
