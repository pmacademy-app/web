import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { AvatarService, type StorageCleanupResult } from '@/lib/avatar/avatar-service'
import { log } from '@/lib/monitoring/log'
import { runRetentionSweep } from '@/lib/retention/sweep'
import { createServiceRoleClient } from '@/lib/supabase'

/**
 * POST|GET /api/cron/cleanup — the retention sweep (B9-D).
 *
 * Accepts the scheduler's `CRON_SECRET` bearer token or an authenticated admin
 * session — the same two callers as before B7-C, resolved once by `resolveActor`
 * with a constant-time secret comparison.
 *
 * ## This route deletes nothing until a human turns it on
 *
 * Two independent gates, and BOTH must open:
 *
 *   1. `dryRun` defaults to **true**. A caller has to ask for deletion explicitly.
 *   2. `RETENTION_DELETE_ENABLED` must be exactly `'true'` in the environment.
 *
 * Either one left alone keeps the route in report-only mode, where it runs the
 * same queries, returns the same counts, and removes nothing. That is deliberate:
 * L-11's windows were decided on paper, and the first production run should answer
 * "what would this actually remove?" with real numbers before anyone approves
 * removing them. Deleted rows are recoverable only from a backup.
 *
 * The environment flag is the human approval gate. It is not something the
 * scheduler can set, and the scheduled workflow does not pass `dryRun: false` — so
 * enabling deletion is a deliberate act by a person with access to the deployment
 * configuration, not a side effect of the cron continuing to run.
 *
 * ## What it sweeps
 *
 * `lib/retention/policy.ts` holds the windows, each quoting the L-11 line it comes
 * from. `admin_audit_logs` is not in scope for deletion at any age.
 */

/** The environment flag that, with an explicit `dryRun: false`, permits deletion. */
function deletionEnabledInEnvironment(): boolean {
  return process.env.RETENTION_DELETE_ENABLED === 'true'
}

async function readRequestedDryRun(request: Request): Promise<boolean> {
  // Default true. A body that is absent, unparseable, or silent on `dryRun` leaves
  // the route in report-only mode — the safe reading of an ambiguous request.
  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown }
  return typeof body.dryRun === 'boolean' ? body.dryRun : true
}

export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.cleanup',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/cleanup',
  },
  async ({ request, requestId }) => {
    const requestedDryRun = await readRequestedDryRun(request)
    const deletionEnabled = deletionEnabledInEnvironment()
    const dryRun = requestedDryRun || !deletionEnabled

    if (!requestedDryRun && !deletionEnabled) {
      log.warn('retention.deletion_requested_but_disabled', {
        // Someone asked for a live run and the environment has not authorised it.
        // Answering with a dry run rather than an error keeps the scheduled job
        // green while making the refusal visible.
        gate: 'RETENTION_DELETE_ENABLED',
      })
    }

    const supabase = createServiceRoleClient()
    const sweep = await runRetentionSweep(supabase, { dryRun })

    // Orphaned avatar storage rides the same execution budget and the same
    // dry-run discipline, per B9-D: the two are one cron's worth of work and one
    // decision about whether deletion is on.
    let avatars: StorageCleanupResult | { dryRun: boolean; error: string }
    try {
      avatars = await AvatarService.cleanupOrphanedAvatars({ dryRun, minAgeHours: 24 })
    } catch (err) {
      // Storage being unreachable must not fail the retention run that already
      // happened above, so the failure is reported in the payload instead.
      log.warnException('retention.avatar_cleanup_failed', err)
      avatars = { dryRun, error: 'avatar cleanup failed' }
    }

    return NextResponse.json({
      success: true,
      implemented: true,
      dryRun,
      deletionEnabled,
      requestId,
      note: dryRun
        ? 'Report-only. Nothing was deleted. Set RETENTION_DELETE_ENABLED=true and post {"dryRun":false} to enable deletion.'
        : 'Retention sweep executed. Deleted rows are recoverable only from backup.',
      retention: sweep,
      avatars,
      timestamp: new Date().toISOString(),
      // Kept for the scheduler and any dashboard that read the old shape.
      cleanedRows: sweep.totalDeleted,
    })
  }
)

/**
 * The scheduler calls POST; GET is kept for manual admin inspection.
 *
 * A GET has no body, so `readRequestedDryRun` returns true and the route is always
 * report-only over GET. That is the intended behaviour: browsing to this endpoint
 * must never delete anything.
 */
export const GET = POST
