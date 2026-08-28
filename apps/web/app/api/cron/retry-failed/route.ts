import { NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

import { requireAdminUser } from '@/lib/admin/guard'

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
        operation: 'cron_retry_failed_auth',
        message: 'Unauthorized cron request: CRON_SECRET or Admin session required on /api/cron/retry-failed',
      })
      return NextResponse.json({ error: 'Unauthorized: Valid CRON_SECRET or Admin session required.' }, { status: 401 })
    }
  }

  try {
    const result = await processEmailQueue(50)
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      retried: result.processed,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Cron execution failed'
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'error',
      category: 'cron',
      operation: 'cron_retry_failed_exception',
      message: `Unhandled exception in /api/cron/retry-failed: ${errorMsg}`,
    })
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return POST(request)
}
