import { NextResponse } from 'next/server'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { renderEmailTemplate } from '@/emails'

export const runtime = 'nodejs'

/**
 * POST /api/admin/emails/preview
 *
 * Renders the actual email template with sample variables and optional subject override.
 * Returns rendered HTML, text, and subject for admin visual preview.
 */
export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.preview.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/preview',
  },
  async ({ request }) => {
    let body: { template_key?: unknown; subject_override?: string; recipient_name?: string }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as { template_key?: unknown; subject_override?: string; recipient_name?: string }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { template_key, subject_override, recipient_name } = body

    if (!template_key || typeof template_key !== 'string') {
      throw new RouteError(400, 'VALIDATION', 'template_key is required')
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://prodily.app'

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
  }
)
