import { NextRequest, NextResponse } from 'next/server'
import { requireAdminUser, logAdminAction } from '@/lib/admin/guard'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

export const runtime = 'nodejs'

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
    const { type } = body

    if (!type || !['weekly_recap', 'daily_reminder'].includes(type)) {
      return NextResponse.json({ error: "type must be 'weekly_recap' or 'daily_reminder'" }, { status: 400 })
    }

    const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
    if (isGlobalPause) {
      return NextResponse.json({ error: 'Cannot run digest while Global Email Pause is active.' }, { status: 400 })
    }

    const supabase = createServiceRoleClient()
    let queuedCount = 0

    if (type === 'weekly_recap') {
      const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.weekly_recap')
      if (!isEnabled) {
        return NextResponse.json({ error: 'Weekly recap automation is currently disabled in settings.' }, { status: 400 })
      }

      const { data: rawUsers } = await supabase
        .from('users')
        .select('id, email, name, total_xp, current_streak')
        .not('email', 'is', null)
        .limit(100)

      const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; total_xp?: number; current_streak?: number }>
      const weekNumber = Math.ceil(new Date().getDate() / 7)
      const dateStr = new Date().toISOString().slice(0, 10)

      for (const user of users) {
        if (!user.email) continue
        const result = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: 'learning.weekly_recap',
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            lessonsCompletedCount: Math.floor((user.total_xp || 0) / 50),
            xpEarnedThisWeek: Math.min(300, user.total_xp || 0),
            currentStreak: user.current_streak || 0,
            weekNumber,
          },
          eventId: `manual-weekly-recap-${user.id}-${dateStr}`,
          eventType: 'system.weekly_recap',
          category: 'learning',
          priorityLevel: 'medium',
        })
        if (result.success) queuedCount++
      }

      await EmailAutomationsService.recordDigestRun('weeklyRecap')
    } else {
      const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.daily_reminder')
      if (!isEnabled) {
        return NextResponse.json({ error: 'Daily reminder automation is currently disabled in settings.' }, { status: 400 })
      }

      const { data: rawUsers } = await supabase
        .from('users')
        .select('id, email, name, current_streak')
        .gt('current_streak', 0)
        .not('email', 'is', null)
        .limit(100)

      const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; current_streak?: number }>
      const todayDate = new Date().toISOString().slice(0, 10)

      for (const user of users) {
        if (!user.email) continue
        const result = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: 'learning.daily_reminder',
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            currentStreak: user.current_streak || 1,
            dueCount: 5,
          },
          eventId: `manual-daily-reminder-${user.id}-${todayDate}`,
          eventType: 'learning.daily_reminder',
          category: 'learning',
          priorityLevel: 'medium',
        })
        if (result.success) queuedCount++
      }

      await EmailAutomationsService.recordDigestRun('dailyReminder')
    }

    await logAdminAction(
      authResult.userId,
      authResult.email || 'admin@prodily.me',
      'digest_run_now_triggered',
      'system_settings',
      type,
      { type, queuedCount }
    )

    return NextResponse.json({
      success: true,
      message: `Manual dispatch completed. Queued ${queuedCount} notification(s).`,
      queuedCount,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Manual run failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
