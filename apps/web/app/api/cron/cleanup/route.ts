import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'

/**
 * POST|GET /api/cron/cleanup
 *
 * Accepts the scheduler's `CRON_SECRET` bearer token or an authenticated admin
 * session — the same two callers as before B7-C, now resolved once by
 * `resolveActor` with a constant-time secret comparison instead of a per-route
 * `===`.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.cleanup',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/cleanup',
  },
  async () => {
    // NOT IMPLEMENTED. No retention policy has been decided, so this route deletes
    // nothing. It previously returned a plain success with cleanedRows: 0, which made a
    // green scheduled run look like retention was happening. Report the truth instead so
    // the workflow does not imply work that is not being done. See ISSUES_KNOWN.md D-06
    // and ISSUE-21.
    console.warn('[cron/cleanup] No-op: retention policy not implemented; no rows were deleted.')

    return NextResponse.json({
      success: true,
      implemented: false,
      note: 'Retention cleanup is not implemented. No rows were deleted. See ISSUES_KNOWN.md ISSUE-21.',
      timestamp: new Date().toISOString(),
      cleanedRows: 0,
    })
  }
)

export const GET = POST
