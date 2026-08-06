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

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = `${BRAND.emailFromName} <${BRAND.emailFromAddress}>`

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
}): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY missing. Simulating send to ${to}: "${subject}"`)
    return { success: true, id: 'simulated-dev-id' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject,
        html,
        text,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[email] Resend API error:', data)
      return { success: false, error: data.message ?? 'Email send failed' }
    }

    return { success: true, id: data.id }
  } catch (err) {
    console.error('[email] Exception sending email:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
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
