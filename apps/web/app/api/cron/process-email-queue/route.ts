import { NextResponse } from 'next/server'

import { withRoute } from '@/lib/api/with-route'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

async function recordSchedulerHeartbeat(
  status: 'healthy' | 'failed',
  details: Record<string, unknown>
): Promise<void> {
  try {
    const { createServiceRoleClient } = await import('@/lib/supabase')
    const supabase = createServiceRoleClient()
    const nowIso = new Date().toISOString()
    const payload = {
      job: 'process-email-queue',
      status,
      last_run_at: nowIso,
      ...(status === 'healthy' ? { last_success_at: nowIso } : {}),
      ...details,
    }
    await supabase.from('system_settings').upsert({
      key: 'cron_heartbeat:process-email-queue',
      value: (payload as unknown as import('@/lib/supabase').Json),
      updated_at: nowIso,
    })
  } catch (err) {
    console.warn('[process-email-queue] Failed to record scheduler heartbeat:', err)
  }
}

/**
 * POST|GET /api/cron/process-email-queue
 *
 * Accepts the scheduler's `CRON_SECRET` bearer token or an authenticated admin
 * session. The unauthorized-attempt record is preserved through `onDenied`, and
 * the durable scheduler heartbeat is still written on both outcomes.
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
      const result = await processEmailQueue(50)
      const durationMs = Date.now() - startTime

      await recordSchedulerHeartbeat('healthy', {
        last_duration_ms: durationMs,
        last_result: result,
      })

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
      await recordSchedulerHeartbeat('failed', {
        last_duration_ms: durationMs,
        error: errorMsg,
      })

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
