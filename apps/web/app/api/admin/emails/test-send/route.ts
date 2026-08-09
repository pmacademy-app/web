import { NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { evaluateRateLimit } from '@/lib/rate-limit'
import { renderEmailTemplate } from '@/emails'
import { sendEmail } from '@/lib/email'
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

  const rateCheck = evaluateRateLimit(`admin_test_email_${authGuard.userId}`, {
    limit: 10,
    windowMs: 60 * 1000,
  })

  if (!rateCheck.success) {
    return NextResponse.json({ error: 'Rate limit exceeded for test email dispatches.' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { templateKey, toEmail, variables: customVars } = body

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

    const rendered = await renderEmailTemplate(templateKey, sampleVariables)

    const sendResult = await sendEmail({
      to: toEmail.trim(),
      subject: `[ADMIN TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
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
