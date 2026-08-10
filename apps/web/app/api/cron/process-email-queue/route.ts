import { NextResponse } from 'next/server'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'warning',
      category: 'cron',
      operation: 'cron_process_queue_auth',
      message: 'Unauthorized cron request: CRON_SECRET mismatch on /api/cron/process-email-queue',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processEmailQueue(50)
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      result,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Cron execution failed'
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
