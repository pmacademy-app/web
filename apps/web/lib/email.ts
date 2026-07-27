/**
 * Transactional Email Service via Resend API.
 *
 * Rules:
 * - Server-only. RESEND_API_KEY is never exposed to the browser.
 * - If RESEND_API_KEY is missing (e.g. in dev), logs email to console without throwing.
 */

export interface EmailRecipient {
  email: string
  name?: string
}

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = 'PM Academy <welcome@pmacademy.com>'

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

/**
 * Sends confirmation email when a user joins the waitlist.
 */
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
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1a1a; background-color: #fbfaf6; padding: 20px; }
          .container { max-width: 560px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 12px; border: 1px solid #e5e5e5; }
          .logo { font-family: Georgia, serif; font-size: 20px; font-weight: bold; color: #1a1a1a; margin-bottom: 24px; }
          .btn { display: inline-block; background-color: #d97706; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px; margin-top: 16px; }
          .footer { margin-top: 32px; font-size: 12px; color: #737373; border-t: 1px solid #f5f5f5; pt: 16px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">PM Academy</div>
          <h2>You're on the list, ${firstName}! 🎉</h2>
          <p>Thank you for joining the PM Academy waitlist.</p>
          <p>We're building a structured, free 90-lesson Product Management curriculum designed to take you from foundational principles to portfolio-ready artifacts — completely free.</p>
          <p>We'll notify you as soon as early access opens.</p>
          <div class="footer">
            PM Academy — 90 lessons. 9 modules. Free forever.<br>
            If you didn't sign up for this waitlist, you can safely ignore this email.
          </div>
        </div>
      </body>
    </html>
  `

  const text = `Hi ${firstName},\n\nYou're on the list for PM Academy! We'll notify you as soon as early access opens.\n\nPM Academy — 90 lessons. 9 modules. Free forever.`

  return sendEmail({
    to: email,
    subject: "You're on the PM Academy waitlist! 🎉",
    html,
    text,
  })
}
