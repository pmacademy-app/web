import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function verifyResendWebhookSignature(request: Request, rawBody: string, secret: string): boolean {
  const svixId = request.headers.get('svix-id') || request.headers.get('webhook-id')
  const svixTimestamp = request.headers.get('svix-timestamp') || request.headers.get('webhook-timestamp')
  const svixSignature = request.headers.get('svix-signature') || request.headers.get('webhook-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false
  }

  // Reject signatures older than 5 minutes
  const timestampNum = parseInt(svixTimestamp, 10)
  if (isNaN(timestampNum)) return false
  const nowSec = Math.floor(Date.now() / 1000)
  if (Math.abs(nowSec - timestampNum) > 300) {
    return false
  }

  let cleanSecret = secret.trim()
  if (cleanSecret.startsWith('whsec_')) {
    cleanSecret = cleanSecret.substring(6)
  }

  let secretBytes: Buffer
  try {
    secretBytes = Buffer.from(cleanSecret, 'base64')
  } catch {
    secretBytes = Buffer.from(cleanSecret, 'utf-8')
  }

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
  const computedHmac = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')
  const expectedSig = `v1,${computedHmac}`

  const signatures = svixSignature.split(' ')
  for (const sig of signatures) {
    try {
      const sigBuf = Buffer.from(sig.trim())
      const expectedBuf = Buffer.from(expectedSig)
      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true
      }
    } catch {
      // Ignored
    }
  }

  return false
}

async function fetchInboundEmailBody(emailId: string): Promise<{ text?: string; html?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !emailId) return {}

  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    if (!res.ok) return {}
    const emailData = await res.json()
    return {
      text: typeof emailData.text === 'string' ? emailData.text : undefined,
      html: typeof emailData.html === 'string' ? emailData.html : undefined,
    }
  } catch {
    return {}
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const secret = process.env.RESEND_WEBHOOK_SECRET

    // 1. Verify Webhook Signature if configured in environment
    if (secret) {
      const isValid = verifyResendWebhookSignature(request, rawBody, secret)
      if (!isValid) {
        const svixId = request.headers.get('svix-id') || request.headers.get('webhook-id') || 'unknown'
        console.warn('[ResendWebhook] Unauthorized webhook request: Svix signature verification failed.')
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'warning',
          category: 'webhook',
          operation: 'resend_webhook_auth',
          message: `Unauthorized request: Svix signature or secret verification failed (svix-id: ${svixId})`,
        })
        return NextResponse.json({ error: 'Unauthorized: Invalid webhook signature' }, { status: 401 })
      }
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(rawBody)
    } catch (parseErr) {
      const parseMsg = parseErr instanceof Error ? parseErr.message : 'Invalid JSON'
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'error',
        category: 'webhook',
        operation: 'resend_webhook_parse',
        message: `Invalid JSON payload in Resend webhook: ${parseMsg}`,
      })
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const eventType = String(payload.type || 'email.received')
    console.log('[ResendWebhook] Inbound webhook received event type:', eventType)

    const data = (payload.data || payload) as Record<string, unknown>
    const emailId = String(data.email_id || data.id || '')

    // Handle Outbound Resend Delivery Events (sent, delivered, failed, bounced, complained)
    if (eventType !== 'email.received' && eventType.startsWith('email.')) {
      try {
        const supabase = createServiceRoleClient()

        // 1. Find target queue item by resend_id
        let queueId: string | null = null
        if (emailId) {
          const { data: queueItem } = await supabase
            .from('email_queue')
            .select('id')
            .eq('resend_id', emailId)
            .maybeSingle()
          if (queueItem && queueItem.id) queueId = String(queueItem.id)
        }

        // 2. Insert into email_delivery_events log
        await supabase.from('email_delivery_events').insert({
          email_queue_id: queueId,
          resend_id: emailId || null,
          event_type: eventType,
          metadata: (data as unknown as import('@/lib/supabase').Json),
          occurred_at: new Date().toISOString(),
        })

        // 3. Update queue item status if matched
        if (queueId) {
          if (eventType === 'email.delivered') {
            await supabase
              .from('email_queue')
              .update({ status: 'delivered', delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', queueId)
          } else if (eventType === 'email.failed' || eventType === 'email.bounced') {
            await supabase
              .from('email_queue')
              .update({ status: 'failed', error_message: `Resend event: ${eventType}`, failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', queueId)
          }
        }

        // 4. Auto-suppress on spam complaints
        if (eventType === 'email.complained') {
          const recipientEmail = String(data.to || data.recipient || '')
          if (recipientEmail) {
            await supabase
              .from('email_suppressions')
              .upsert({ email: recipientEmail, reason: 'spam_complaint', suppressed_at: new Date().toISOString() })
          }
        }

        return NextResponse.json({ success: true, processed: true, outboundEventType: eventType })
      } catch (outboundErr) {
        console.warn('[ResendWebhook] Non-fatal outbound event persistence warning:', outboundErr)
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'webhook',
          operation: 'resend_webhook_process',
          message: `Outbound event processing failure: ${outboundErr instanceof Error ? outboundErr.message : String(outboundErr)}`,
          resendId: emailId || undefined,
        })
        return NextResponse.json({ success: true, warning: 'Outbound processing logged warning' })
      }
    }

    const fromRaw = String(data.from || data.sender || 'unknown@example.com')
    const subject = String(data.subject || 'Direct Inbound Email Inquiry')

    // Parse sender name & email
    const senderName = fromRaw.includes('<') ? fromRaw.split('<')[0].replace(/"/g, '').trim() : fromRaw
    const senderEmail = fromRaw.includes('<') ? fromRaw.split('<')[1].replace('>', '').trim() : fromRaw

    // 2. Fetch full email content from Resend Receiving API if email_id is present
    let textBody = String(data.text || '')
    let htmlBody = String(data.html || '')

    if ((!textBody && !htmlBody) && emailId) {
      const fetched = await fetchInboundEmailBody(emailId)
      if (fetched.text) textBody = fetched.text
      if (fetched.html) htmlBody = fetched.html
    }

    const finalMessageBody = textBody.trim() || 'Inbound email received without body content.'

    // 3. Persist inbound message into Supabase contact_messages table
    let insertedId: string | null = null
    try {
      const supabase = createServiceRoleClient()
      const { data: inserted, error } = await supabase
        .from('contact_messages')
        .insert({
          user_id: null,
          name: senderName.substring(0, 100) || senderEmail,
          email: senderEmail.substring(0, 150),
          subject: subject.substring(0, 200),
          category: 'inbound_email',
          message: finalMessageBody.substring(0, 3000),
          status: 'new',
          source: 'inbound_email',
        })
        .select('id')
        .single()

      if (error) {
        console.warn('[ResendWebhook] Warning saving inbound message to DB:', error)
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'warning',
          category: 'webhook',
          operation: 'resend_webhook_db',
          message: `Inbound message DB save warning: ${error.message}`,
        })
      } else if (inserted) {
        insertedId = inserted.id
      }
    } catch (dbErr) {
      console.warn('[ResendWebhook] Non-fatal DB warning (env or connection unavailable):', dbErr)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'warning',
        category: 'webhook',
        operation: 'resend_webhook_db',
        message: `Inbound message DB save exception: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      })
    }

    // 4. Forward alert email to pmacademyapp@gmail.com inbox via sendEmail()
    try {
      await sendEmail({
        to: 'pmacademyapp@gmail.com',
        subject: `Fwd: [Direct Email Inquiry] ${subject}`,
        html: `
          <h2>Direct Inbound Email Received</h2>
          <p><strong>From:</strong> ${escapeHtml(senderName)} (&lt;<a href="mailto:${escapeHtml(senderEmail)}">${escapeHtml(senderEmail)}</a>&gt;)</p>
          <p><strong>To:</strong> hello@prodily.adityagangwani.me</p>
          <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <p><strong>Database Record ID:</strong> <code>${insertedId || 'N/A'}</code></p>
          <hr />
          <p><strong>Message Content:</strong></p>
          <blockquote style="background:#f5f5f5; padding:12px; border-left:4px solid #3b82f6; font-family:sans-serif;">
            ${htmlBody || escapeHtml(finalMessageBody).replace(/\n/g, '<br />')}
          </blockquote>
        `,
        text: `Direct Inbound Email Received\n\nFrom: ${senderName} (${senderEmail})\nTo: hello@prodily.adityagangwani.me\nSubject: ${subject}\nRecord ID: ${insertedId || 'N/A'}\n\nContent:\n${finalMessageBody}`,
      })
    } catch (forwardErr) {
      console.warn('[ResendWebhook] Non-fatal warning forwarding inbound email to Gmail:', forwardErr)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'warning',
        category: 'webhook',
        operation: 'resend_webhook_forward',
        message: `Inbound email forwarding warning: ${forwardErr instanceof Error ? forwardErr.message : String(forwardErr)}`,
      })
    }

    return NextResponse.json({ success: true, processed: true, messageId: insertedId })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Invalid webhook payload'
    const { logSystemError } = await import('@/lib/monitoring/logger')
    void logSystemError({
      severity: 'error',
      category: 'webhook',
      operation: 'resend_webhook_exception',
      message: `Unhandled exception in Resend webhook: ${errorMsg}`,
    })
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 })
  }
}
