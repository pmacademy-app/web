import { NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

import { requireAdminUser } from '@/lib/admin/guard'

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

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization')
  const isCronAuthorized = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`)

  if (!isCronAuthorized) {
    const adminCheck = await requireAdminUser(request)
    if (!adminCheck.authorized) {
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'warning',
        category: 'cron',
        operation: 'cron_process_queue_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/process-email-queue',
      })
      return NextResponse.json({ error: 'Unauthorized: Valid CRON_SECRET or Admin session required.' }, { status: 401 })
    }
  }

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
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
