import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase'
import { sendGovernedEmail } from '@/lib/email-governance'
import { EMAIL_HTTP_TIMEOUT_MS } from '@/lib/notifications/config'
import { log } from '@/lib/monitoring/log'

/**
 * True when a provider's bounce payload explicitly reports a TRANSIENT failure.
 *
 * A bounce is not one thing. A full mailbox, a greylisting delay or a momentarily
 * unreachable MX is temporary and the address is still valid; "no such user" is
 * permanent. Both used to normalise to `email.bounced` and both were then written to
 * `email_suppressions` with `reason: 'hard_bounce'`, which meant one transient failure
 * could permanently stop mail to a perfectly good address.
 *
 * The test is deliberately positive — a bounce is only treated as soft when the
 * provider SAYS it is transient. `Permanent`, `Undetermined`, and any payload we
 * cannot read stay hard, so this narrows suppression without weakening it.
 *
 * Resend nests the verdict under `data.bounce.type`; Brevo signals it with its own
 * `soft_bounce` event name, which is handled where the event type is normalised.
 */
export function isTransientBounce(data: Record<string, unknown>): boolean {
  const bounce = data?.bounce
  if (!bounce || typeof bounce !== 'object') return false
  const type = (bounce as Record<string, unknown>).type
  return typeof type === 'string' && type.toLowerCase() === 'transient'
}

/**
 * Largest webhook body this route will buffer, in bytes.
 *
 * Provider delivery events are a few KB and inbound mail arrives as metadata (the body
 * is fetched from the Resend API afterwards), so 256 KiB leaves plenty of headroom. The
 * cap is applied BEFORE authentication: the signature check needs the whole body, so
 * without it an unauthenticated caller could make every instance buffer an arbitrarily
 * large request.
 */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

/** Support inbox that receives forwarded copies of inbound mail. */
const SUPPORT_FORWARD_TO = 'pmacademyapp@gmail.com'

class PayloadTooLargeError extends Error {}

/**
 * Reads the body as text, refusing once it passes `maxBytes`.
 *
 * The declared length is checked first so an honest oversized request is refused
 * without reading it; the stream is then counted as it arrives, because the header
 * is optional and can lie. Either way no more than `maxBytes` is ever buffered.
 * (Same approach as the private helper in `app/api/client-errors/route.ts`.)
 */
async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError()
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new PayloadTooLargeError()
    }
    chunks.push(value)
  }

  const joined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

/**
 * The first recipient address in a provider field.
 *
 * Resend sends `to` as an array of addresses; `String(['a@x', 'b@y'])` is
 * `'a@x,b@y'`, which is not an address and used to be written to `email_suppressions`
 * as one.
 */
function firstAddress(value: unknown): string {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : ''
  return typeof value === 'string' ? value : ''
}

/** One header-safe line: no CR/LF or other control characters, bounded length. */
function singleLine(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().substring(0, max)
}

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

function verifyBrevoWebhookAuth(request: Request, secret: string): boolean {
  if (!secret) return false
  const cleanExpected = secret.trim()
  if (!cleanExpected) return false
  const expectedBuf = Buffer.from(cleanExpected)

  // Canonical header verification: x-brevo-webhook-secret (or standard x-webhook-secret)
  const headerSecret =
    request.headers.get('x-brevo-webhook-secret') ||
    request.headers.get('x-webhook-secret')

  if (!headerSecret) {
    return false
  }

  const providedBuf = Buffer.from(headerSecret.trim())
  if (providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    return true
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
      signal: AbortSignal.timeout(EMAIL_HTTP_TIMEOUT_MS),
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
  let rawBody: string
  try {
    rawBody = await readCappedText(request, MAX_WEBHOOK_BODY_BYTES)
  } catch (err) {
    if (err instanceof PayloadTooLargeError) {
      log.warn('email.webhook.payload_too_large', { maxBytes: MAX_WEBHOOK_BODY_BYTES })
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
    }
    log.warnException('email.webhook.body_read_failed', err)
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
  }

  try {
    const resendSecret = process.env.RESEND_WEBHOOK_SECRET
    const brevoSecret = process.env.BREVO_WEBHOOK_SECRET

    const hasSvixHeaders = Boolean(
      request.headers.get('svix-id') ||
      request.headers.get('webhook-id') ||
      request.headers.get('svix-signature') ||
      request.headers.get('webhook-signature')
    )

    // A webhook this endpoint cannot cryptographically authenticate must be rejected in
    // production. This route writes suppression records and disables users' email
    // preferences, so accepting an unverifiable request is a forgery vector — and there
    // is no startup env validation guaranteeing the secrets are set. We therefore fail
    // CLOSED unless we are explicitly in local dev/test, where a provider secret is
    // typically absent; an unset or unknown NODE_ENV (as on a misconfigured deploy)
    // counts as production and is rejected, mirroring the cron actor's "no secret
    // configured must never authenticate" rule.
    const allowUnverified = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

    // 1. Authenticate Inbound Webhook Request
    if (hasSvixHeaders) {
      // Path A: Resend / Svix Signature Verification
      if (resendSecret) {
        const isValid = verifyResendWebhookSignature(request, rawBody, resendSecret)
        if (!isValid) {
          const svixId = request.headers.get('svix-id') || request.headers.get('webhook-id') || 'unknown'
          log.warn('email.webhook.signature_rejected', { provider: 'resend' })
          const { logSystemError } = await import('@/lib/monitoring/logger')
          void logSystemError({
            severity: 'warning',
            category: 'webhook',
            operation: 'resend_webhook_auth',
            message: `Unauthorized request: Svix signature or secret verification failed (svix-id: ${svixId})`,
          })
          return NextResponse.json({ error: 'Unauthorized: Invalid webhook signature' }, { status: 401 })
        }
      } else if (!allowUnverified) {
        // Signed webhook request arrived but RESEND_WEBHOOK_SECRET is not configured —
        // we cannot verify it, so reject rather than process it unauthenticated.
        log.warn('email.webhook.unauthenticated', { reason: 'resend_secret_unconfigured' })
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'webhook',
          operation: 'resend_webhook_auth',
          message: 'Rejected webhook: Svix headers present but RESEND_WEBHOOK_SECRET is not configured',
        })
        return NextResponse.json({ error: 'Unauthorized: Webhook verification is not configured' }, { status: 401 })
      }
    } else {
      // Path B: Brevo Webhook Shared Secret Verification
      if (brevoSecret) {
        const isValid = verifyBrevoWebhookAuth(request, brevoSecret)
        if (!isValid) {
          log.warn('email.webhook.signature_rejected', { provider: 'brevo' })
          const { logSystemError } = await import('@/lib/monitoring/logger')
          void logSystemError({
            severity: 'warning',
            category: 'webhook',
            operation: 'brevo_webhook_auth',
            message: 'Unauthorized request: Brevo webhook secret verification failed',
          })
          return NextResponse.json({ error: 'Unauthorized: Invalid Brevo webhook authentication' }, { status: 401 })
        }
      } else if (resendSecret) {
        // If Resend secret is configured but request lacks Svix headers and no Brevo secret is configured, reject
        log.warn('email.webhook.unauthenticated', { reason: 'missing_headers' })
        return NextResponse.json({ error: 'Unauthorized: Missing webhook authentication' }, { status: 401 })
      } else if (!allowUnverified) {
        // No webhook secret configured at all — cannot authenticate; reject in production.
        log.warn('email.webhook.unauthenticated', { reason: 'no_secret_configured' })
        const { logSystemError } = await import('@/lib/monitoring/logger')
        void logSystemError({
          severity: 'error',
          category: 'webhook',
          operation: 'brevo_webhook_auth',
          message: 'Rejected webhook: no BREVO_WEBHOOK_SECRET or RESEND_WEBHOOK_SECRET is configured',
        })
        return NextResponse.json({ error: 'Unauthorized: Webhook verification is not configured' }, { status: 401 })
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

    // Normalize event type across Resend (payload.type) and Brevo (payload.event)
    let eventType = String(payload.type || '')
    let emailId = ''
    let providerLabel: 'Resend' | 'Brevo' = 'Resend'

    if (!eventType && typeof payload.event === 'string') {
      providerLabel = 'Brevo'
      const brevoEvent = payload.event.toLowerCase()
      if (brevoEvent === 'delivered') eventType = 'email.delivered'
      // `soft_bounce` is deliberately NOT folded in here — see `isTransientBounce`.
      else if (brevoEvent === 'soft_bounce') eventType = 'email.bounced_soft'
      else if (brevoEvent === 'hard_bounce' || brevoEvent === 'blocked' || brevoEvent === 'invalid_email') eventType = 'email.bounced'
      else if (brevoEvent === 'spam' || brevoEvent === 'complaint') eventType = 'email.complained'
      else if (brevoEvent === 'opened' || brevoEvent === 'unique_opened') eventType = 'email.opened'
      else if (brevoEvent === 'click') eventType = 'email.clicked'
      else eventType = `brevo.${brevoEvent}`

      emailId = String(payload['message-id'] || payload.message_id || payload['messageId'] || payload.id || '')
    } else if (!eventType) {
      eventType = 'email.received'
    }

    const data = (payload.data || payload) as Record<string, unknown>
    if (!emailId) {
      emailId = String(data.email_id || data.id || data['message-id'] || data.message_id || '')
    }

    // Resend reports both kinds of bounce as `email.bounced` and puts the distinction
    // in the payload (`data.bounce.type`), so it can only be read once `data` exists.
    //
    // Only an explicitly Transient bounce is downgraded. `Permanent`, `Undetermined`
    // and a missing/malformed bounce block all stay hard: a mailbox we cannot prove is
    // temporary must keep its suppression, or we regress the protection that stopped
    // us re-sending to addresses that had already hard-bounced.
    if (eventType === 'email.bounced' && isTransientBounce(data)) {
      eventType = 'email.bounced_soft'
    }
    // Both values come from the provider payload, so they are caller-influenced
    // and belong in fields rather than interpolated into the message.
    log.info('email.webhook.received', { eventType, emailId: emailId || null })

    // Handle Outbound Delivery Events (sent, delivered, failed, bounced, complained)
    if (eventType !== 'email.received' && (eventType.startsWith('email.') || eventType.startsWith('brevo.'))) {
      try {
        const supabase = createServiceRoleClient()

        // Derive deterministic provider event ID for idempotency
        const svixId = request.headers.get('svix-id') || request.headers.get('webhook-id')
        const rawEventId = String(data.id || payload.id || '')
        const providerEventId = svixId
          ? `resend:${svixId}`
          : rawEventId
            ? `${providerLabel.toLowerCase()}:${rawEventId}`
            : emailId
              ? `${providerLabel.toLowerCase()}:${emailId}:${eventType}`
              : null

        // Idempotency: verify this exact provider event has not already been ingested
        if (providerEventId) {
          try {
            const { data: existingEvent } = await supabase
              .from('email_delivery_events')
              .select('id')
              .eq('provider_event_id', providerEventId)
              .maybeSingle()

            if (existingEvent && existingEvent.id) {
              return NextResponse.json({
                success: true,
                processed: true,
                duplicate: true,
                outboundEventType: eventType,
              })
            }
          } catch {
            // Column or query failure falls through to normal insert
          }
        }

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

        // 2. Insert into email_delivery_events log (with provider_event_id and sanitized metadata)
        await supabase.from('email_delivery_events').insert({
          email_queue_id: queueId,
          resend_id: emailId || null,
          event_type: eventType,
          metadata: (data as unknown as import('@/lib/supabase').Json),
          occurred_at: new Date().toISOString(),
          provider_event_id: providerEventId || null,
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
              .update({ status: 'failed', error_message: `${providerLabel} event: ${eventType}`, failed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
              .eq('id', queueId)
          }
          // A soft bounce deliberately leaves `status` alone. The provider accepted the
          // message and is still retrying it on its own schedule; flipping the row to
          // `failed` would both misreport a delivery that may yet succeed and expose it
          // to admin "Retry All", producing a duplicate send. The event itself is
          // already recorded above, which is where transient failures belong.
        }

        // 4. Auto-suppress on spam complaints and HARD bounces only.
        //
        // `email.bounced_soft` is excluded on purpose: suppression here is permanent
        // (`expires_at` is never set), so applying it to a transient failure would
        // silently and irreversibly cut off a valid recipient.
        //
        // Bounces were previously logged but never suppressed, so the address stayed
        // eligible for delivery: an admin "Retry All" would re-send to a mailbox that
        // had already hard-bounced, damaging sender reputation on both providers.
        // Suppression is also what keeps the retry routes from requeueing these rows —
        // they exclude suppressed recipients before requeueing.
        if (eventType === 'email.complained' || eventType === 'email.bounced') {
          const rawEmail = (
            firstAddress(data.email) ||
            firstAddress(data.to) ||
            firstAddress(data.recipient) ||
            firstAddress(payload.email)
          ).trim().toLowerCase()
          if (rawEmail && rawEmail.includes('@')) {
            // A. Synchronize suppression record in email_suppressions
            await supabase
              .from('email_suppressions')
              .upsert({
                email: rawEmail,
                reason: eventType === 'email.complained' ? 'spam_complaint' : 'hard_bounce',
                suppressed_at: new Date().toISOString(),
              }, { onConflict: 'email' })

            // B. Synchronize user preferences if user exists in public.users
            try {
              const { data: userRow } = await supabase
                .from('users')
                .select('id')
                .eq('email', rawEmail)
                .maybeSingle()

              if (userRow && userRow.id) {
                await supabase
                  .from('user_notification_preferences')
                  .update({
                    all_email: false,
                    marketing_email: false,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('user_id', userRow.id)
              }
            } catch (userSyncErr) {
              log.warnException('email.webhook.user_pref_suppress_sync_failed', userSyncErr)
            }
          }
        }

        return NextResponse.json({ success: true, processed: true, outboundEventType: eventType })
      } catch (outboundErr) {
        log.warnException('email.webhook.outbound_event_persist_failed', outboundErr)
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
    // The sender's HTML is never used: it is attacker-controlled markup. Only the text
    // part is stored and forwarded (escaped).
    if (!textBody && emailId) {
      const fetched = await fetchInboundEmailBody(emailId)
      if (fetched.text) textBody = fetched.text
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
        log.warn('email.webhook.inbound_persist_failed', { reason: error?.message })
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
      log.warnException('email.webhook.persist_unavailable', dbErr)
      const { logSystemError } = await import('@/lib/monitoring/logger')
      void logSystemError({
        severity: 'warning',
        category: 'webhook',
        operation: 'resend_webhook_db',
        message: `Inbound message DB save exception: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
      })
    }

    // 4. Forward a copy to the support inbox through the governed gateway.
    //
    // Anyone on the internet can mail hello@, so this used to be an unmetered path to a
    // paid provider (raw `sendEmail()`, no quota, no rate limit), and it pasted the
    // sender's own `html` into the forward unescaped. Now the forward draws on its own
    // small budget (`support.inbound_forward`) and carries only the escaped plain text.
    // When the budget is spent the message is still stored above; only the copy is
    // skipped.
    try {
      const safeSubject = singleLine(subject, 200)
      const forwardKey = insertedId
        ? `inbound:${insertedId}`
        : `inbound:${crypto.createHash('sha256').update(emailId || rawBody).digest('hex').slice(0, 32)}`
      const forwardBody = finalMessageBody.substring(0, 3000)
      const forward = await sendGovernedEmail({
        purpose: 'support.inbound_forward',
        to: SUPPORT_FORWARD_TO,
        subject: `Fwd: [Direct Email Inquiry] ${safeSubject}`,
        html: `
          <h2>Direct Inbound Email Received</h2>
          <p><strong>From:</strong> ${escapeHtml(senderName)} (&lt;${escapeHtml(senderEmail)}&gt;)</p>
          <p><strong>To:</strong> hello@prodily.app</p>
          <p><strong>Subject:</strong> ${escapeHtml(safeSubject)}</p>
          <p><strong>Database Record ID:</strong> <code>${escapeHtml(insertedId || 'N/A')}</code></p>
          <hr />
          <p><strong>Message Content (plain text):</strong></p>
          <blockquote style="background:#f5f5f5; padding:12px; border-left:4px solid #3b82f6; font-family:sans-serif;">
            ${escapeHtml(forwardBody).replace(/\n/g, '<br />')}
          </blockquote>
        `,
        text: `Direct Inbound Email Received\n\nFrom: ${senderName} (${senderEmail})\nTo: hello@prodily.app\nSubject: ${safeSubject}\nRecord ID: ${insertedId || 'N/A'}\n\nContent:\n${forwardBody}`,
        idempotencyKey: forwardKey,
      })
      if (!forward.sent) {
        log.warn('email.webhook.forward_not_sent', { blocked: forward.blocked ?? null, statusCode: forward.statusCode ?? null })
      }
    } catch (forwardErr) {
      log.warnException('email.webhook.forward_failed', forwardErr)
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
    // The detail is in the log above; the caller gets a generic message.
    return NextResponse.json({ success: false, error: 'Invalid webhook payload' }, { status: 400 })
  }
}
