import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { renderEmailTemplate } from '@/emails'

export const runtime = 'nodejs'

/**
 * POST /api/admin/emails/preview
 *
 * Renders the actual email template with sample variables and optional subject override.
 * Returns rendered HTML, text, and subject for admin visual preview.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const { template_key, subject_override, recipient_name } = body

    if (!template_key || typeof template_key !== 'string') {
      return NextResponse.json({ error: 'template_key is required' }, { status: 400 })
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.adityagangwani.me'

    const sampleVars: Record<string, unknown> = {
      userName: recipient_name || 'Alex Chen',
      userEmail: 'alex@example.com',
      appUrl: siteUrl,
      moduleName: 'Product Discovery & Problem Framing',
      badgeName: 'Chief Product Officer',
      newLevel: 5,
      streakDays: 7,
      subject: subject_override || 'Important Update from Prodily',
      message: 'Here is a preview of the message content formatted using our responsive email layout.',
      ...(subject_override ? { subjectOverride: subject_override } : {}),
    }

    const rendered = await renderEmailTemplate(template_key, sampleVars)

    const finalSubject = subject_override ? subject_override.trim() : rendered.subject

    return NextResponse.json({
      success: true,
      data: {
        subject: finalSubject,
        html: rendered.html,
        text: rendered.text,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to render email preview' },
      { status: 500 }
    )
  }
}
