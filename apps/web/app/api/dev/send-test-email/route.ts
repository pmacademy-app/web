import { NextResponse } from 'next/server'
import { enqueueNotificationItem, processEmailQueue } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint restricted to development' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const templateKey = body.templateKey || 'auth.welcome'
    const toEmail = body.toEmail || 'test@example.com'

    const enqueueRes = await enqueueNotificationItem({
      userId: body.userId || 'dev-user-01',
      toEmail,
      toName: body.toName || 'Dev Tester',
      channel: 'email',
      templateKey,
      templateVariables: body.variables || { userName: 'Dev Tester' },
      eventType: 'dev.test_trigger',
      category: 'security',
      priorityLevel: 'high',
    })

    if (!enqueueRes.success) {
      return NextResponse.json({ success: false, reason: enqueueRes.reason }, { status: 400 })
    }

    // Immediately process queue in dev mode if requested
    if (body.processNow) {
      const processRes = await processEmailQueue(1)
      return NextResponse.json({ success: true, queueId: enqueueRes.queueId, processRes })
    }

    return NextResponse.json({ success: true, queueId: enqueueRes.queueId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to send test email'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}
