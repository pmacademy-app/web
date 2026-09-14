import { adminErrorMessage } from '@/lib/errors/api-response'
import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { withRoute } from '@/lib/api/with-route'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'

export const runtime = 'nodejs'

export const GET = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.schedule.get',
    domain: 'admin',
    summary: 'Unexpected failure in GET /api/admin/emails/automations/schedule',
  },
  async () => {
    try {
      const schedules = await EmailAutomationsService.getDigestSchedules()
      return NextResponse.json({ success: true, schedules })
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to fetch digest schedules')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
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
    try {
      const admin = requireAdmin(actor)
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
    } catch (err) {
      const message = adminErrorMessage(err, 'Failed to update digest schedules')
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  }
)
