import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { renderEmailTemplate } from '@/emails'
import { sendEmail } from '@/lib/email'
import { sanitizeEmailHtml } from '@/lib/admin/sanitize-email-html'
import { BRAND } from '@/lib/brand'

export async function POST(request: Request) {
  let authGuard
  try {
    authGuard = await requireAdminUser(request)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unauthorized' },
      { status: 401 }
    )
  }

  if (!authGuard.authorized) {
    return NextResponse.json({ error: authGuard.error }, { status: authGuard.statusCode || 403 })
  }

  const rateCheck = await evaluateRateLimit(`admin_test_email_${authGuard.userId}`, {
    limit: 10,
    windowMs: 60 * 1000,
  })

  if (!rateCheck.success) {
    return NextResponse.json({ error: 'Rate limit exceeded for test email dispatches.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { templateKey, toEmail, subjectLine, bodyHtml, bodyText, variables: customVars } = body

    if (!templateKey || typeof templateKey !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid templateKey' }, { status: 400 })
    }

    if (!toEmail || typeof toEmail !== 'string' || !toEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid recipient toEmail address is required' }, { status: 400 })
    }

    const sampleVariables: Record<string, unknown> = {
      userName: 'Prodily Admin Tester',
      email: toEmail,
      confirmationUrl: `${BRAND.siteUrl}/api/auth/callback?token_hash=test_token_hash&type=signup`,
      resetUrl: `${BRAND.siteUrl}/reset-password?token=test_reset_token`,
      moduleName: 'Product Strategy & Vision',
      badgeName: 'Visionary Strategist',
      newLevel: 5,
      certificateCode: 'PMA-2026-TEST01',
      certificateUrl: `${BRAND.siteUrl}/verify/PMA-2026-TEST01`,
      portfolioUrl: `${BRAND.siteUrl}/p/admin_tester`,
      weeklyXp: 450,
      lessonsCompleted: 8,
      streakDays: 12,
      ...(customVars || {}),
    }

    let finalSubject = ''
    let finalHtml = ''
    let finalText = ''

    if (bodyHtml && typeof bodyHtml === 'string' && bodyHtml.trim()) {
      const { interpolateVariables, stripHtmlToPlainText } = await import('@/emails')
      // Admin-authored/pasted HTML is untrusted input, sanitized before dispatch —
      // this path sends unsaved editor content directly, bypassing the save-time
      // sanitization on the template CRUD routes.
      const cleanHtml = sanitizeEmailHtml(bodyHtml)
      finalSubject = interpolateVariables(subjectLine || 'Test Email', sampleVariables)
      finalHtml = interpolateVariables(cleanHtml, sampleVariables)
      finalText = bodyText ? interpolateVariables(bodyText, sampleVariables) : stripHtmlToPlainText(finalHtml)
    } else {
      const rendered = await renderEmailTemplate(templateKey, sampleVariables)
      finalSubject = rendered.subject
      finalHtml = rendered.html
      finalText = rendered.text
    }

    const sendResult = await sendEmail({
      to: toEmail.trim(),
      subject: `[ADMIN TEST] ${finalSubject}`,
      html: finalHtml,
      text: finalText,
    })

    if (!sendResult.success) {
      return NextResponse.json({ success: false, error: sendResult.error || 'Email dispatch failed.' }, { status: 500 })
    }

    await logAdminAction(
      authGuard.userId!,
      authGuard.email!,
      'send_test_email',
      'email_template',
      templateKey,
      { recipient: toEmail, resendId: sendResult.id }
    )

    return NextResponse.json({
      success: true,
      message: `Test email '${templateKey}' sent successfully to ${toEmail}.`,
      resendId: sendResult.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error sending test email'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
