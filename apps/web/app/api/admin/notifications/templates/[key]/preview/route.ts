import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { EMAIL_TEMPLATE_MAP, interpolateVariables, stripHtmlToPlainText } from '@/emails'
import { TEMPLATE_SAMPLE_VARIABLES } from '@/lib/admin/communications-service'

export const runtime = 'nodejs'


export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.notifications.templates.key.preview.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/notifications/templates/[key]/preview',
  },
  async ({ request, params }) => {
    try {
      const { key } = params
      const entry = EMAIL_TEMPLATE_MAP[key]
      if (!entry) {
        return NextResponse.json({ error: `Template '${key}' not recognized.` }, { status: 404 })
      }

      const body = await request.json()
      const { subjectLine, bodyHtml, bodyText, variables = {} } = body

      const mergedVariables = { ...TEMPLATE_SAMPLE_VARIABLES, ...variables }
      const rawSubject = subjectLine || entry.subjectLine
      const subject = interpolateVariables(rawSubject, mergedVariables)

      let html = ''
      let text = ''

      if (bodyHtml && typeof bodyHtml === 'string' && bodyHtml.trim()) {
        const interpolatedHtml = interpolateVariables(bodyHtml, mergedVariables)
        html = interpolatedHtml.startsWith('<!DOCTYPE') ? interpolatedHtml : `<!DOCTYPE html>${interpolatedHtml}`
        text = bodyText ? interpolateVariables(bodyText, mergedVariables) : stripHtmlToPlainText(interpolatedHtml)
      } else {
        // Static fallback
        const Component = entry.component
        const React = (await import('react')).default
        const element = React.createElement(Component, mergedVariables)
        const { renderToStaticMarkup } = await import('react-dom/server')
        const rawHtml = renderToStaticMarkup(element)
        html = `<!DOCTYPE html>${rawHtml}`
        text = stripHtmlToPlainText(rawHtml)
      }

      return NextResponse.json({
        success: true,
        data: {
          subject,
          html,
          text,
        },
      })
    } catch (err) {
      const message = adminErrorMessage(err, 'Preview rendering failed')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
