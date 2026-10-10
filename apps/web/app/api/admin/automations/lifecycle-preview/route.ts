import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { adminErrorMessage } from '@/lib/errors/api-response'
import { runLifecycle } from '@/lib/growth/lifecycle-run'

const previewQuerySchema = z.object({
  /** 'true' counts every learner rather than only those in their delivery hour right now. */
  force: z.string().optional(),
})

/**
 * Admin R6 C2 — lifecycle dry run.
 *
 * Runs the lifecycle cron's evaluation with `dryRun` forced on, so nothing is written (no
 * email, no in-app, no holdout record), and returns what the run would do. Without
 * `?force=true` the counts cover learners in their delivery hour right now, which is what
 * the next hourly cron run would see.
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.automations.lifecycle_preview.run',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/automations/lifecycle-preview',
    query: previewQuerySchema,
  },
  async ({ actor, query }) => {
    requireAdmin(actor)
    try {
      const force = query.force === 'true'
      const run = await runLifecycle({ dryRun: true, force })

      return NextResponse.json({
        success: true,
        dryRun: true,
        force,
        paused: run.paused,
        lifecycleQueued: run.lifecycleQueued,
        queuedBySequence: run.queuedBySequence,
        heldOut: run.heldOut,
        skippedTimezone: run.skippedTimezone,
        skippedNoSegment: run.skippedNoSegment,
        nudges: run.proofNudges.sent,
        nudgesHeldOut: run.proofNudges.heldOut,
        nudgePagesSkipped: run.proofNudges.pagesSkipped,
      })
    } catch (error: unknown) {
      const message = adminErrorMessage(error, 'Failed to preview the lifecycle run.')
      console.error('[API POST /api/admin/automations/lifecycle-preview] Error:', error)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
)
