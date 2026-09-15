import { NextResponse } from 'next/server'

import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { logAdminAction } from '@/lib/admin/guard'
import { renderEmailTemplate } from '@/emails'
import { BRAND } from '@/lib/brand'
import { sendEmail } from '@/lib/email'

/**
 * An admin route that happens to live outside `app/api/admin/`, so it falls in
 * neither the G1 nor the G2 group. It is migrated here with the same admin actor
 * policy those waves use — `requireAdminUser`'s database re-read of `is_admin` and
 * its denial audit logging are reached through `resolveActor`, unchanged.
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'dev.send_test_email',
    domain: 'email',
    summary: 'Unexpected failure sending a developer test email',
    errorMessage: 'Failed to send test email',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)

    const body = (await request.json()) as {
      templateKey?: string
      toEmail?: string
      variables?: Record<string, unknown>
    }
    const templateKey = body.templateKey || 'auth.welcome'
    const toEmail = body.toEmail || admin.email || 'admin@prodily.adityagangwani.me'

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
      ...(body.variables || {}),
    }

    const rendered = await renderEmailTemplate(templateKey, sampleVariables)

    const sendResult = await sendEmail({
      to: toEmail.trim(),
      subject: `[DEV TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
    })

    if (!sendResult.success) {
      // Admin routes keep failure detail by decision (D-02).
      throw new RouteError(500, 'SERVER_ERROR', sendResult.error || 'Failed to dispatch email')
    }

    await logAdminAction(
      admin.userId,
      admin.email,
      'send_dev_test_email',
      'email_template',
      templateKey,
      { recipient: toEmail, resendId: sendResult.id }
    )

    return NextResponse.json({ success: true, resendId: sendResult.id })
  }
)
