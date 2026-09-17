import { NextResponse } from 'next/server'

import { requireUserId } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'

export const runtime = 'nodejs'

/**
 * POST /api/user/quick-start
 *
 * Marks the quick-start tour complete for the calling learner (B13-A).
 *
 * `QuickStartContext` used to do this from the browser with
 * `supabase.auth.updateUser({ data: { quick_start_completed: true } })` followed by
 * `refreshSession()`, both of which require a session held in browser JavaScript. B13-A
 * removes that session, so the write moves to where the credential already is.
 *
 * The flag lives in `user_metadata` rather than a column because that is where
 * `app/(app)/layout.tsx` already reads it from, and changing the storage location would
 * turn a session-model batch into a data migration. `admin.updateUserById` merges the
 * object it is given, so passing only this key leaves any other metadata intact — a
 * detail worth stating, because passing the whole object would let a stale client
 * clobber `full_name`.
 *
 * The body is ignored on purpose: there is exactly one thing this endpoint does, and the
 * actor decides *whose* flag is set. Accepting a `userId` would be an IDOR waiting to
 * happen, so the id comes from `requireUserId(actor)` and from nowhere else.
 */
export const POST = withRoute(
  {
    actor: { allow: ['learner', 'admin'] },
    operation: 'user.quick_start.complete',
    domain: 'auth',
    summary: 'Unhandled exception completing the quick start tour',
  },
  async ({ actor }) => {
    const userId = requireUserId(actor)
    const supabase = createServiceRoleClient()

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { quick_start_completed: true },
    })

    if (error) {
      throw new RouteError(500, 'SERVER_ERROR', 'Could not save your quick start progress.')
    }

    return NextResponse.json({ success: true, quick_start_completed: true }, { status: 200 })
  }
)
