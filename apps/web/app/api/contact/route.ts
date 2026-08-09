import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { getAuthenticatedUserFromRequest } from '@/lib/auth'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/email'

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUserFromRequest(request)
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon'
    const rateCheck = evaluateRateLimit(`contact_${user ? user.id : clientIp}`, { limit: 3, windowMs: 10 * 60 * 1000 })

    if (!rateCheck.success) {
      return NextResponse.json({ error: 'Too many contact messages sent. Please try again later.' }, { status: 429 })
    }

    const body = await request.json()
    const { name, email, subject, category, message } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email address is required.' }, { status: 400 })
    }
    if (!subject || typeof subject !== 'string' || !subject.trim()) {
      return NextResponse.json({ error: 'Subject is required.' }, { status: 400 })
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'Message content is required.' }, { status: 400 })
    }

    const cleanName = name.trim().substring(0, 100)
    const cleanEmail = email.trim().toLowerCase().substring(0, 150)
    const cleanSubject = subject.trim().substring(0, 200)
    const cleanCategory = typeof category === 'string' ? category.trim().substring(0, 50) : 'general'
    const cleanMessage = message.trim().substring(0, 3000)

    const supabase = createServerSupabaseClient()

    // 1. Persist contact message to Database (Fail-safe check)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('contact_messages' as any) as any)
      .insert({
        user_id: user ? user.id : null,
        name: cleanName,
        email: cleanEmail,
        subject: cleanSubject,
        category: cleanCategory,
        message: cleanMessage,
        status: 'new',
        source: 'web_form',
      })
      .select('id')
      .single()

    // If Database insert fails, NEVER return false success
    if (error || !data) {
      console.error('[contact/route] Error inserting contact message into Database:', error)
      return NextResponse.json({ error: 'Failed to record contact message. Please try again.' }, { status: 500 })
    }

    // 2. Direct Resend email dispatch to pmacademyapp@gmail.com inbox
    const safeName = escapeHtml(cleanName)
    const safeEmail = escapeHtml(cleanEmail)
    const safeSubject = escapeHtml(cleanSubject)
    const safeCategory = escapeHtml(cleanCategory)
    const safeMessageHtml = escapeHtml(cleanMessage).replace(/\n/g, '<br />')
    const userTypeText = user ? `Authenticated User (ID: ${user.id})` : 'Anonymous Homepage Visitor'

    const emailSubject = `[PM Academy Support Inquiry] ${cleanSubject}`
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 20px; }
            .card { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 28px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .header { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 16px; border-b: 1px solid #e2e8f0; padding-bottom: 12px; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
            .meta-table td { padding: 6px 0; }
            .meta-label { font-weight: bold; color: #64748b; width: 130px; }
            .message-box { background: #f1f5f9; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6; font-size: 14px; color: #334155; }
            .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 12px; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">New Contact Inquiry — PM Academy</div>
            <table class="meta-table">
              <tr><td class="meta-label">From:</td><td><strong>${safeName}</strong> (&lt;<a href="mailto:${safeEmail}">${safeEmail}</a>&gt;)</td></tr>
              <tr><td class="meta-label">Subject:</td><td>${safeSubject}</td></tr>
              <tr><td class="meta-label">Topic Category:</td><td>${safeCategory}</td></tr>
              <tr><td class="meta-label">Submitter Type:</td><td>${userTypeText}</td></tr>
              <tr><td class="meta-label">Message ID:</td><td><code>${data.id}</code></td></tr>
            </table>
            <div class="message-box">
              ${safeMessageHtml}
            </div>
            <div class="footer">
              Prodily PM Academy Support System • Automated Dispatch to pmacademyapp@gmail.com
            </div>
          </div>
        </body>
      </html>
    `

    const textContent = `New Contact Inquiry — PM Academy\n\nFrom: ${cleanName} (${cleanEmail})\nSubject: ${cleanSubject}\nCategory: ${cleanCategory}\nSubmitter: ${userTypeText}\nMessage ID: ${data.id}\n\nMessage:\n${cleanMessage}`

    let emailSent = false
    try {
      const emailResult = await sendEmail({
        to: 'pmacademyapp@gmail.com',
        subject: emailSubject,
        html: htmlContent,
        text: textContent,
      })

      if (emailResult.success) {
        emailSent = true
      } else {
        console.error('[contact/route] Resend email dispatch failed for message ID:', data.id, emailResult.error)
      }
    } catch (emailErr) {
      console.error('[contact/route] Exception sending alert email for message ID:', data.id, emailErr)
    }

    // Return successful response since message is stored in DB. Indicate email delivery status.
    return NextResponse.json({
      success: true,
      messageId: data.id,
      emailSent,
      ...(emailSent ? {} : { note: 'Your message was saved successfully. Support notification is queued.' }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error submitting contact form.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
