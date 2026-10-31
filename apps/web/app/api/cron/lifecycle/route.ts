import { NextResponse } from 'next/server'
import { z } from 'zod'

import { withRoute } from '@/lib/api/with-route'
import { runLifecycle } from '@/lib/growth/lifecycle-run'
import { withCronHeartbeat } from '@/lib/monitoring/cron-heartbeat'

/**
 * `force=true` bypasses the per-user local send window, matching the daily
 * reminder / weekly recap crons. Only the literal string 'true' has an effect.
 */
const forceQuerySchema = z.object({
  force: z.string().optional(),
  dryRun: z.string().optional(),
  /** Older name for dryRun. */
  nudgeDryRun: z.string().optional(),
})

/**
 * Phase 1.5 — Lifecycle reactivation cron.
 *
 * Evaluates every user against the three lifecycle sequences and the proof nudges; the
 * logic lives in `runLifecycle` (lib/growth/lifecycle-run.ts), which the admin dry-run
 * preview shares.
 *
 * Runs hourly (pg_cron primary once approved, GitHub Actions '30 * * * *' fallback). Each
 * learner is due from their preferred local hour until 22:00 local (ENG-01), so a missed run
 * is caught by the next one; the idempotency keys keep it to one email per sequence episode.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.lifecycle',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/lifecycle',
    query: forceQuerySchema,
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_lifecycle_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/lifecycle',
      })
    },
  },
  async ({ query }) => withCronHeartbeat('lifecycle', async () => {
    // Growth R5 B6/B7: a dry run counts who would get a lifecycle email or a proof nudge, and
    // writes nothing at all. Counts cover learners in their delivery hour this run (add
    // force=true to count everyone; still nothing is written).
    const run = await runLifecycle({
      source: 'cron',
      dryRun: query.dryRun === 'true' || query.nudgeDryRun === 'true',
      force: query.force === 'true',
    })

    if (run.paused) {
      return NextResponse.json({
        success: true,
        message: 'Lifecycle sequences suppressed by Global Pause',
        isGlobalPause: true,
        lifecycleQueued: 0,
      })
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      lifecycleQueued: run.lifecycleQueued,
      queuedBySequence: run.queuedBySequence,
      heldOut: run.heldOut,
      skippedTimezone: run.skippedTimezone,
      skippedNoSegment: run.skippedNoSegment,
      skippedAlreadyQueued: run.skippedAlreadyQueued,
      pagesSkipped: run.pagesSkipped,
      dryRun: run.dryRun,
      proofNudges: {
        dryRun: run.dryRun,
        sent: run.proofNudges.sent,
        heldOut: run.proofNudges.heldOut,
        pagesSkipped: run.proofNudges.pagesSkipped,
      },
    })
  })
)

export const GET = POST
