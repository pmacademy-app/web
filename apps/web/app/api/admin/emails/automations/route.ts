import { NextResponse } from 'next/server'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import type { EmailAutomationKey } from '@/lib/notifications/automations/types'

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
    let body: {
      settingKey?: 'toggle' | 'global_pause' | 'daily_limit'
      payload?: { automationKey?: EmailAutomationKey; enabled?: boolean; limit?: number }
    }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as typeof body
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { settingKey, payload } = body

    if (!settingKey || !payload) {
      throw new RouteError(400, 'VALIDATION', 'Missing settingKey or payload')
    }

    const result = await EmailAutomationsService.updateSetting(settingKey, payload)
    if (!result.success) {
      throw new RouteError(400, 'VALIDATION', result.error || 'Failed to update setting')
    }

    const updatedState = await EmailAutomationsService.getState()
    return NextResponse.json({ success: true, state: updatedState })
  }
)
