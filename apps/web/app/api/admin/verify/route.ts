import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'

/**
 * Verifies whether the current session holds admin authorization.
 *
 * Used by the admin login page immediately after sign-in to decide between
 * entering the console (/admin) or showing the access denied page. The check
 * runs the full server-side RBAC guard (ADMIN_EMAILS OR users.is_admin) and is
 * audit-logged on denial.
 *
 * **This is the one admin route that must not be `allow: ['admin']`.** Its whole
 * purpose is to answer "are you an admin?" with a 200 either way, so the login page
 * can route. An admin-only policy would turn the negative answer into a 403 and the
 * page would read no `authorized` field at all. The wider policy costs nothing: the
 * guard still runs through `resolveActor`, so the database re-read of `is_admin` and
 * the denial audit row are unchanged, and the route exposes no admin data.
 */
export const GET = withRoute(
  {
    actor: { allow: ['admin', 'learner', 'anonymous'] },
    operation: 'admin.verify.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/verify',
  },
  async ({ actor }) => {
    const authorized = actor.kind === 'admin'

    return NextResponse.json({
      authorized,
      email: actor.kind === 'admin' ? actor.email : actor.kind === 'learner' ? actor.email : null,
      reason: authorized ? null : 'Unauthorized',
    })
  }
)
