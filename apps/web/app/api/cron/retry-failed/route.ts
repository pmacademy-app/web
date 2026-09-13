import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

/**
 * POST|GET /api/cron/retry-failed
 *
 * Accepts the scheduler's `CRON_SECRET` bearer token or an authenticated admin
 * session. The unauthorized-attempt record is preserved through `onDenied`.
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
      // This route runs a normal queue pass — the same work /api/cron/process-email-queue
      // already does every five minutes. It performs no dead-letter recovery and does not
      // clear next_retry_at, so `processed` is the honest field name; the previous
      // `retried` read as "failed items recovered", which it never was.
      // See ISSUES_KNOWN.md D-06 and ISSUE-21.
      const result = await processEmailQueue(50)
      return NextResponse.json({
        success: true,
        timestamp: new Date().toISOString(),
        processed: result.processed,
        note: 'Duplicates the 5-minute queue pass; performs no dead-letter recovery.',
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
