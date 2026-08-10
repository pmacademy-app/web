import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('Authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.daily_reminder')
  const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()

  if (!isEnabled || isGlobalPause) {
    return NextResponse.json({
      success: true,
      message: 'Daily reminder disabled via Admin Automations or Global Pause',
      isEnabled,
      isGlobalPause,
      remindersQueued: 0,
    })
  }

  const supabase = createServerSupabaseClient()
  let remindersQueued = 0

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawUsers } = await (supabase.from('users' as any) as any)
      .select('id, email, name, current_streak')
      .gt('current_streak', 0)
      .not('email', 'is', null)
      .limit(100)

    const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; current_streak?: number }>

    if (users.length > 0) {
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
          eventId: `daily-reminder-${user.id}-${todayDate}`,
          eventType: 'learning.daily_reminder',
          category: 'learning',
          priorityLevel: 'medium',
        })
        if (result.success) remindersQueued++
      }
    }
  } catch (err) {
    console.error('[cron/daily-reminder] Failed to queue daily reminders:', err)
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    remindersQueued,
  })
}

export async function GET(request: Request) {
  return POST(request)
}
