import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireAdmin } from '@/lib/api/actor'
import type { AdminLifecyclePreviewResponse } from '@/lib/api/contracts/admin'
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
    // A preview walks every learner page (with force=true, all of them), so a stuck or
    // repeated click must not turn into a load test. Two runs per admin per minute.
    rateLimit: [
      {
        key: ({ actor }) => (actor.kind === 'admin' ? `admin_lifecycle_preview_${actor.userId}` : null),
        limit: 2,
        windowMs: 60 * 1000,
      },
    ],
  },
  async ({ actor, query }) => {
    requireAdmin(actor)
    try {
      const force = query.force === 'true'
      const run = await runLifecycle({ source: 'admin_preview', dryRun: true, force })

      return NextResponse.json<AdminLifecyclePreviewResponse>({
        success: true,
        dryRun: true,
        force,
        paused: run.paused,
        lifecycleQueued: run.lifecycleQueued,
        queuedBySequence: run.queuedBySequence,
        heldOut: run.heldOut,
        skippedTimezone: run.skippedTimezone,
        skippedNoSegment: run.skippedNoSegment,
        pagesSkipped: run.pagesSkipped,
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
