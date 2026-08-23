/**
 * Transactional Email Service via Resend API.
 *
 * Rules:
 * - Server-only. RESEND_API_KEY is never exposed to the browser.
 * - If RESEND_API_KEY is missing, logs email to console without throwing.
 */

import { BRAND } from '@/lib/brand'

export interface EmailRecipient {
  email: string
  name?: string
}

export function getFromEmail(): string {
  const envFrom = process.env.RESEND_FROM_EMAIL?.trim()
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
}: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<SendEmailResult> {
  const fromEmail = getFromEmail()
  const apiKey = process.env.RESEND_API_KEY
  const isTest = process.env.NODE_ENV === 'test' || process.env.RESEND_SIMULATE === 'true'

  if (!apiKey || isTest) {
    console.log(`[email] RESEND_API_KEY missing or test environment. Simulating send to ${maskEmail(to)}: "${subject}" from "${fromEmail}"`)
    return { success: true, id: 'simulated-dev-id', provider: 'simulated', statusCode: 200 }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(8000),
    })

    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }

    if (!res.ok) {
      console.warn(`[email] Resend API error (status ${res.status}):`, data.message || data.name || res.statusText)
      
      const brevoApiKey = process.env.BREVO_API_KEY
      if (brevoApiKey) {
        console.log('[email] Attempting fallback to Brevo...')
        try {
          const senderName = fromEmail.split('<')[0].trim() || BRAND.emailFromName
          const senderEmailMatch = fromEmail.match(/<([^>]+)>/)
          const senderEmail = senderEmailMatch ? senderEmailMatch[1] : fromEmail

          const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': brevoApiKey,
              'accept': 'application/json',
            },
            body: JSON.stringify({
              sender: { name: senderName, email: senderEmail },
              to: [{ email: to }],
              subject,
              htmlContent: html,
              textContent: text,
            }),
            signal: AbortSignal.timeout(8000),
          })
          
          const brevoData = (await brevoRes.json().catch(() => ({}))) as { messageId?: string; message?: string }
          if (!brevoRes.ok) {
            console.error(`[email] Brevo API fallback error (status ${brevoRes.status}):`, brevoData.message || brevoRes.statusText)
            return {
              success: false,
              error: brevoData.message ?? data.message ?? 'Email send failed on primary and fallback providers',
              statusCode: brevoRes.status,
              provider: 'brevo',
            }
          }
          return { success: true, id: brevoData.messageId, provider: 'brevo', statusCode: 200 }
        } catch (fallbackErr) {
          console.error('[email] Exception during Brevo fallback:', fallbackErr instanceof Error ? fallbackErr.message : 'Unknown')
          return {
            success: false,
            error: fallbackErr instanceof Error ? fallbackErr.message : 'Brevo fallback timeout/error',
            statusCode: 503,
            provider: 'brevo',
          }
        }
      }
      
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
    console.error('[email] Exception sending email:', isTimeout ? 'Request timed out after 8s' : (err instanceof Error ? err.message : 'Unknown'))
    return {
      success: false,
      error: isTimeout ? 'Email provider request timed out' : (err instanceof Error ? err.message : 'Unknown network failure'),
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
