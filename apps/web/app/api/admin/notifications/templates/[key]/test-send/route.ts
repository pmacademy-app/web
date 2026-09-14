import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { EMAIL_TEMPLATE_MAP, interpolateVariables, stripHtmlToPlainText } from '@/emails'
import { TEMPLATE_SAMPLE_VARIABLES } from '@/lib/admin/communications-service'
import { globalProviderRegistry, getActiveEmailProvider } from '@/lib/notifications/providers'

export const runtime = 'nodejs'


export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.templates.key.test_send.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/templates/[key]/test-send',
  },
  async ({ request, actor, params }) => {
    try {
      const admin = requireAdmin(actor)
      const { key } = params
      const entry = EMAIL_TEMPLATE_MAP[key]
      if (!entry) {
        return NextResponse.json({ error: `Template '${key}' not recognized.` }, { status: 404 })
      }

      const body = await request.json()
      const { recipientEmail, subjectLine, bodyHtml, bodyText, variables = {} } = body

      if (!recipientEmail || typeof recipientEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        return NextResponse.json({ error: 'A valid recipientEmail is required for test send.' }, { status: 400 })
      }

      const mergedVariables = { ...TEMPLATE_SAMPLE_VARIABLES, ...variables, email: recipientEmail }
      const rawSubject = subjectLine || entry.subjectLine
      const subject = interpolateVariables(rawSubject, mergedVariables)

      let html = ''
      let text = ''

      if (bodyHtml && typeof bodyHtml === 'string' && bodyHtml.trim()) {
        const interpolatedHtml = interpolateVariables(bodyHtml, mergedVariables)
        html = interpolatedHtml.startsWith('<!DOCTYPE') ? interpolatedHtml : `<!DOCTYPE html>${interpolatedHtml}`
        text = bodyText ? interpolateVariables(bodyText, mergedVariables) : stripHtmlToPlainText(interpolatedHtml)
      } else {
        const Component = entry.component
        const React = (await import('react')).default
        const element = React.createElement(Component, mergedVariables)
        const { renderToStaticMarkup } = await import('react-dom/server')
        const rawHtml = renderToStaticMarkup(element)
        html = `<!DOCTYPE html>${rawHtml}`
        text = stripHtmlToPlainText(rawHtml)
      }

      // Dispatch via active email provider (Brevo by default)
      const provider = getActiveEmailProvider(globalProviderRegistry)
      if (!provider) {
        return NextResponse.json({ error: 'Email provider not registered.' }, { status: 500 })
      }

      const sendRes = await provider.send({
        recipient: { userId: admin.userId, email: recipientEmail, name: 'Admin Test' },
        channel: 'email',
        templateKey: key,
        templateVersion: 1,
        variables: {
          ...mergedVariables,
          subject: `[TEST] ${subject}`,
          html,
          text,
        },
      })

      if (!sendRes.success) {
        return NextResponse.json({ error: sendRes.error || 'Provider test send failed' }, { status: 500 })
      }

      await logAdminAction(
        admin.userId,
        admin.email || 'admin@prodily.me',
        'template_test_sent',
        'notification_template',
        key,
        {
          recipientEmail,
          templateKey: key,
          subject: `[TEST] ${subject}`,
        }
      )

      return NextResponse.json({
        success: true,
        message: `Test email sent to ${recipientEmail}.`,
        externalId: sendRes.externalId,
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Test send failed')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
