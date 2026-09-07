/**
 * Transactional Email Service via Resend API.
 *
 * Rules:
 * - Server-only. RESEND_API_KEY is never exposed to the browser.
 * - If RESEND_API_KEY is missing, logs email to console without throwing.
 */

import { BRAND } from '@/lib/brand'
import { classifyProviderFailure } from '@/lib/notifications/providers/failure-classification'
import { resolvePrimaryProvider } from '@/lib/notifications/config'

export interface EmailRecipient {
  email: string
  name?: string
}

export function getFromEmail(): string {
  const envFrom = (process.env.BREVO_FROM_EMAIL || process.env.RESEND_FROM_EMAIL)?.trim()
  if (envFrom) {
    if (envFrom.includes('<') && envFrom.includes('>')) {
      return envFrom
    }
    return `${BRAND.emailFromName} <${envFrom}>`
  }
  return `${BRAND.emailFromName} <${BRAND.emailFromAddress}>`
}

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
  statusCode?: number
  provider?: 'resend' | 'brevo' | 'simulated'
}

/**
 * Decides whether a failed send should retry on the OTHER provider.
 *
 * Delegates to the shared classifier so this transport and the queue's provider
 * registry apply identical rules. Failover covers provider-availability failures —
 * timeout, network error, 5xx — AND capacity exhaustion (402/408/429), which is
 * precisely the case a second provider exists for. It never covers failures both
 * providers would reject identically (400 bad recipient, 401/403 auth/config).
 *
 * Volume containment is enforced upstream by the pre-dispatch daily quota gate and
 * signup rate limiting, not by refusing to fail over.
 */
function isFailoverEligibleFailure(result: SendEmailResult): boolean {
  if (result.success) return false
  return classifyProviderFailure(result.statusCode) === 'failover'
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  if (local.length <= 2) return `*@${domain}`
  return `${local[0]}***${local[local.length - 1]}@${domain}`
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  fromEmail: customFromEmail,
  replyTo,
}: {
  to: string
  subject: string
  html: string
  text: string
  fromEmail?: string
  replyTo?: string
}): Promise<SendEmailResult> {
  const fromEmail = customFromEmail || getFromEmail()
  const brevoApiKey = process.env.BREVO_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY
  const isTest = process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_NETWORK_EMAILS !== 'true'
  const isSimulated = process.env.BREVO_SIMULATE === 'true' || process.env.RESEND_SIMULATE === 'true'

  // Shared with the provider registry so auth mail and queued mail always leave via
  // the same provider (previously this preferred Resend while the registry preferred
  // Brevo, splitting sender identity and DKIM alignment between the two stacks).
  const primaryProvider = resolvePrimaryProvider()

  const hasAnyKey = Boolean(brevoApiKey || resendApiKey)

  if (!hasAnyKey || isSimulated || isTest) {
    console.log(
      `[email] Email sending simulated (isTest=${isTest}, simulate=${isSimulated}, primary=${primaryProvider}) to ${maskEmail(to)}: "${subject}" from "${fromEmail}"`
    )
    return { success: true, id: `simulated-${primaryProvider}-${Date.now()}`, provider: 'simulated', statusCode: 200 }
  }

  if (primaryProvider === 'brevo') {
    if (brevoApiKey) {
      const brevoRes = await sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey, replyTo)
      if (brevoRes.success) return brevoRes
      if (resendApiKey && isFailoverEligibleFailure(brevoRes)) {
        console.log(`[email] Brevo failover-eligible failure (status ${brevoRes.statusCode ?? 'network'}), falling back to Resend...`)
        return sendViaResend(to, subject, html, text, fromEmail, resendApiKey, replyTo)
      }
      if (!isFailoverEligibleFailure(brevoRes)) {
        console.warn(`[email] Brevo permanent failure (status ${brevoRes.statusCode}) — not falling back to Resend; both providers would reject this identically.`)
      }
      return brevoRes
    }
    if (resendApiKey) {
      return sendViaResend(to, subject, html, text, fromEmail, resendApiKey, replyTo)
    }
  } else {
    if (resendApiKey) {
      const resendRes = await sendViaResend(to, subject, html, text, fromEmail, resendApiKey, replyTo)
      if (resendRes.success) return resendRes
      if (brevoApiKey && isFailoverEligibleFailure(resendRes)) {
        console.log(`[email] Resend failover-eligible failure (status ${resendRes.statusCode ?? 'network'}), falling back to Brevo...`)
        return sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey, replyTo)
      }
      if (!isFailoverEligibleFailure(resendRes)) {
        console.warn(`[email] Resend permanent failure (status ${resendRes.statusCode}) — not falling back to Brevo; both providers would reject this identically.`)
      }
      return resendRes
    }
    if (brevoApiKey) {
      return sendViaBrevo(to, subject, html, text, fromEmail, brevoApiKey, replyTo)
    }
  }

  return {
    success: false,
    error: 'No valid email provider credentials configured',
    statusCode: 500,
    provider: 'simulated',
  }
}

async function sendViaBrevo(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromEmail: string,
  apiKey: string,
  replyTo?: string
): Promise<SendEmailResult> {
  const senderName = fromEmail.split('<')[0].trim() || BRAND.emailFromName
  const senderEmailMatch = fromEmail.match(/<([^>]+)>/)
  const senderEmail = senderEmailMatch ? senderEmailMatch[1] : fromEmail

  try {
    const brevoBody: Record<string, unknown> = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      headers: {
        'List-Unsubscribe': `<${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.siteUrl}/settings?tab=notifications>`,
      },
    }

    if (replyTo) {
      brevoBody.replyTo = { email: replyTo }
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'accept': 'application/json',
      },
      body: JSON.stringify(brevoBody),
      signal: AbortSignal.timeout(8000),
    })

    const data = (await res.json().catch(() => ({}))) as { messageId?: string; id?: string; message?: string }

    if (!res.ok) {
      console.warn(`[email] Brevo API error (status ${res.status}):`, data.message || res.statusText)
      return {
        success: false,
        error: data.message ?? `Brevo error (${res.status})`,
        statusCode: res.status,
        provider: 'brevo',
      }
    }

    return { success: true, id: data.messageId || data.id, provider: 'brevo', statusCode: 200 }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    console.error('[email] Exception sending via Brevo:', isTimeout ? 'Request timed out after 8s' : err)
    return {
      success: false,
      error: isTimeout ? 'Brevo request timed out' : (err instanceof Error ? err.message : 'Unknown network failure'),
      statusCode: isTimeout ? 504 : 503,
      provider: 'brevo',
    }
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromEmail: string,
  apiKey: string,
  replyTo?: string
): Promise<SendEmailResult> {
  try {
    const resendBody: Record<string, unknown> = {
      from: fromEmail,
      to: [to],
      subject,
      html,
      text,
    }
    if (replyTo) {
      resendBody.reply_to = replyTo
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(resendBody),
      signal: AbortSignal.timeout(8000),
    })

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }

    if (!res.ok) {
      return {
        success: false,
        error: data.message ?? `Resend error (${res.status})`,
        statusCode: res.status,
        provider: 'resend',
      }
    }

    return { success: true, id: data.id, provider: 'resend', statusCode: 200 }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
    return {
      success: false,
      error: isTimeout ? 'Resend request timed out' : (err instanceof Error ? err.message : 'Unknown network failure'),
      statusCode: isTimeout ? 504 : 503,
      provider: 'resend',
    }
  }
}

export async function sendWaitlistConfirmationEmail({
  name,
  email,
}: {
  name: string
  email: string
}) {
  const firstName = name.split(' ')[0] ?? 'there'

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${BRAND.colors.foreground}; background-color: ${BRAND.colors.background}; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e5e5; }
          .logo { margin-bottom: 24px; }
          .footer { margin-top: 32px; font-size: 12px; color: #737373; border-top: 1px solid #f5f5f5; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <img src="${BRAND.siteUrl}${BRAND.assets.logoFullPng}" alt="${BRAND.fullName}" width="192" height="48" style="display:block; max-width:192px; width:100%; height:auto;" />
          </div>
          <h2>You're on the list, ${firstName}!</h2>
          <p>Thank you for joining the ${BRAND.shortName} waitlist.</p>
          <p>We're building a structured, free 90-lesson Product Management curriculum designed to take you from foundational principles to portfolio-ready artifacts - completely free.</p>
          <p>We'll notify you as soon as early access opens.</p>
          <div class="footer">
            ${BRAND.fullName} - ${BRAND.positioning}<br>
            If you didn't sign up for this waitlist, you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `

  const text = `Hi ${firstName},\n\nYou're on the list for ${BRAND.shortName}! We'll notify you as soon as early access opens.\n\n${BRAND.fullName} - ${BRAND.positioning}`

  return sendEmail({
    to: email,
    subject: `You're on the ${BRAND.shortName} waitlist!`,
    html,
    text,
  })
}
