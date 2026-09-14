import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/automations',
  },
  async () => {

    const state = await EmailAutomationsService.getState()
    return NextResponse.json({ success: true, state })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/automations',
  },
  async ({ request }) => {

    try {
      const body = await request.json()
      const { settingKey, payload } = body

      if (!settingKey || !payload) {
        return NextResponse.json({ error: 'Missing settingKey or payload' }, { status: 400 })
      }

      const result = await EmailAutomationsService.updateSetting(settingKey, payload)
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Failed to update setting' }, { status: 400 })
      }

      const updatedState = await EmailAutomationsService.getState()
      return NextResponse.json({ success: true, state: updatedState })
    } catch (err) {
      const errorMsg = adminErrorMessage(err, 'Invalid request payload')
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 })
    }
  }
)
