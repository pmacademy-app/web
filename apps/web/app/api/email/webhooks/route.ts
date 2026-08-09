import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    console.log('[ResendWebhook] Inbound webhook received event type:', payload?.type || 'email.received')

    // Handle email.received event
    const data = (payload.data || payload) as Record<string, unknown>
    const fromAddress = String(data.from || data.sender || 'unknown@example.com')
    const subject = String(data.subject || 'Direct Inbound Inquiry')
    const textBody = String(data.text || data.html || 'Inbound email received')

    const supabase = createServerSupabaseClient()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error } = await (supabase.from('contact_messages' as any) as any)
      .insert({
        user_id: null,
        name: fromAddress.split('<')[0]?.trim() || fromAddress,
        email: fromAddress.includes('<') ? fromAddress.split('<')[1]?.replace('>', '').trim() : fromAddress,
        subject: subject.substring(0, 200),
        category: 'inbound_email',
        message: textBody.substring(0, 3000),
        status: 'new',
        source: 'inbound_email',
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[ResendWebhook] Warning saving inbound message to DB:', error)
    }

    // Outbound email alert to pmacademyapp@gmail.com forwarding direct inbound query
    try {
      await enqueueNotificationItem({
        userId: '00000000-0000-0000-0000-000000000000',
        toEmail: 'pmacademyapp@gmail.com',
        toName: 'PM Academy Inbound Inbox',
        channel: 'email',
        templateKey: 'auth.welcome',
        templateVariables: {
          userName: `Direct Email from ${fromAddress}: "${subject}"`,
        },
        eventId: `inbound_${inserted?.id || Date.now()}`,
        eventType: 'inbound.received',
        category: 'security',
        priorityLevel: 'high',
      })
    } catch (enqueueErr) {
      console.warn('[ResendWebhook] Non-fatal warning forwarding inbound alert:', enqueueErr)
    }

    return NextResponse.json({ success: true, processed: true })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid webhook payload'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 })
  }
}
