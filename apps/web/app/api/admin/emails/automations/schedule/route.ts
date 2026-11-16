import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import type {
  WeeklyRecapSchedule,
  DailyReminderSchedule,
} from '@/lib/notifications/automations/types'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.schedule.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/automations/schedule',
  },
  async () => {
    const schedules = await EmailAutomationsService.getDigestSchedules()
    return NextResponse.json({ success: true, schedules })
  }
)

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.schedule.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/automations/schedule',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)

    let body: {
      weeklyRecap?: Partial<WeeklyRecapSchedule>
      dailyReminder?: Partial<DailyReminderSchedule>
    }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as typeof body
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { weeklyRecap, dailyReminder } = body

    const res = await EmailAutomationsService.updateDigestSchedule({
      weeklyRecap,
      dailyReminder,
    })

    if (!res.success) {
      throw new Error(res.error || 'Failed to update schedule')
    }

    await logAdminAction(
      admin.userId,
      admin.email || 'admin@prodily.me',
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
  }
)
