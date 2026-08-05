import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { AdminConsoleService } from '@/lib/admin/service'
import { processEmailQueue } from '@/lib/notifications/queue/processor'

export async function GET(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const queueOverview = await AdminConsoleService.getEmailQueueOverview()
    return NextResponse.json({ success: true, queue: queueOverview })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch email queue overview'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const authGuard = await requireAdminUser(request)
  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  try {
    const result = await processEmailQueue(50)
    await logAdminAction(
      authGuard.userId!,
      authGuard.email!,
      'trigger_email_queue_processing',
      'queue',
      undefined,
      { processed: result.processed }
    )

    return NextResponse.json({ success: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process email queue'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
