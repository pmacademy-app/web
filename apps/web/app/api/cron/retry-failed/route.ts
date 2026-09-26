import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

/**
 * POST|GET /api/cron/retry-failed
 *
 * @deprecated Deprecated in Phase T5. Email retry handling is natively unified in
 * `/api/cron/process-email-queue`, which processes both 'pending' and 'retrying' items
 * with exponential backoff and reclaims stale processing leases every 5 minutes.
 * Retained for backwards compatibility with external schedulers.
 */
export const POST = withRoute(
  {
    actor: { allow: ['cron', 'admin'] },
    operation: 'cron.retry_failed',
    domain: 'cron',
    summary: 'Unhandled exception in /api/cron/retry-failed',
    onDenied: async () => {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      await logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_retry_failed_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/retry-failed',
      })
    },
  },
  async () => {
    try {
      // Deprecated: /api/cron/process-email-queue already drains both pending and retrying items.
      const result = await processEmailQueue(50)
      return NextResponse.json({
        success: true,
        deprecated: true,
        timestamp: new Date().toISOString(),
        processed: result.processed,
        note: 'Deprecated: retry processing is unified in /api/cron/process-email-queue (duplicates the 5-minute queue pass; performs no dead-letter recovery).',
      })
    } catch (err) {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'cron',
        operation: 'cron_retry_failed_exception',
        message: `Unhandled exception in /api/cron/retry-failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      // Rethrown so the wrapper emits the ADR-006 envelope. Before B7-C this
      // branch returned the raw exception message to the caller.
      throw err
    }
  }
)

export const GET = POST
