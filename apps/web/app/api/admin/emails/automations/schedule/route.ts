import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const schedules = await EmailAutomationsService.getDigestSchedules()
    return NextResponse.json({ success: true, schedules })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch digest schedules'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser(request)
    if (!authResult.authorized || !authResult.userId) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.statusCode || 403 }
      )
    }

    const body = await request.json()
    const { weeklyRecap, dailyReminder } = body

    const res = await EmailAutomationsService.updateDigestSchedule({
      weeklyRecap,
      dailyReminder,
    })

    if (!res.success) {
      return NextResponse.json({ error: res.error || 'Failed to update schedule' }, { status: 500 })
    }

    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'email_digest_schedule_updated',
      'system_settings',
      'email_digest_schedules',
      { weeklyRecap, dailyReminder }
    )

    const updated = await EmailAutomationsService.getDigestSchedules()
    return NextResponse.json({
      success: true,
      message: 'Digest schedules updated successfully.',
      schedules: updated,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update digest schedules'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
