import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser } from '@/lib/admin/guard'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'

export async function GET(request: NextRequest) {
  let authResult
  try {
    authResult = await requireAdminUser(request)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status: 401 })
  }

  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: authResult.statusCode || 403 })
  }

  const state = await EmailAutomationsService.getState()
  return NextResponse.json({ success: true, state })
}

export async function POST(request: NextRequest) {
  let authResult
  try {
    authResult = await requireAdminUser(request)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unauthorized' }, { status: 401 })
  }

  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error || 'Unauthorized' }, { status: authResult.statusCode || 403 })
  }

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
    const errorMsg = err instanceof Error ? err.message : 'Invalid request payload'
    return NextResponse.json({ success: false, error: errorMsg }, { status: 400 })
  }
}
