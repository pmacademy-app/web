import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { processEmailQueue } from '@/lib/notifications/queue/processor'
import { checkStaleHeartbeats, recordCronHeartbeat } from '@/lib/monitoring/cron-heartbeat'

/**
 * POST|GET /api/cron/process-email-queue
 *
 * Accepts the scheduler's `CRON_SECRET` bearer token or an authenticated admin
 * session. The unauthorized-attempt record is preserved through `onDenied`, and
 * the durable scheduler heartbeat is still written on both outcomes.
 *
 * ENG-01: this five-minute run is also the watchdog for every other cron job. After its own
 * heartbeat it checks all of them and raises one out-of-band alert per stale episode.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.process_email_queue',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/process-email-queue',
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_process_queue_auth',
        message:
          'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/process-email-queue',
      })
    },
  },
  async () => {
    const startTime = Date.now()
    try {
      // Drain up to 5 batches (up to 250 emails) per 5-minute cron invocation within a 45s safety window
      const result = await processEmailQueue(50, { maxBatches: 5, maxExecutionMs: 45_000 })
      const durationMs = Date.now() - startTime

      await recordCronHeartbeat('process-email-queue', 'healthy', {
        last_duration_ms: durationMs,
        last_result: result,
      })
      await checkStaleHeartbeats()

      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        durationMs,
        result,
      })
    } catch (err) {
      const durationMs = Date.now() - startTime
      const errorMsg = err instanceof Error ? err.message : 'Cron execution failed'

      // The heartbeat has to record the failure before the error leaves this
      // frame, otherwise a failed run is indistinguishable from one that never
      // started.
      await recordCronHeartbeat('process-email-queue', 'failed', {
        last_duration_ms: durationMs,
        error: errorMsg,
      })
      await checkStaleHeartbeats()

      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_process_queue_exception',
        message: `Unhandled exception in /api/cron/process-email-queue: ${errorMsg}`,
      })
      // Rethrown so the wrapper emits the ADR-006 envelope. Before B7-C this
      // branch returned the raw exception message to the caller.
      throw err
    }
  }
)

export const GET = POST
