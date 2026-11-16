import { NextResponse } from 'next/server'
import { logAdminAction } from '@/lib/admin/guard'
import { requireAdmin } from '@/lib/api/actor'
import { RouteError, withRoute } from '@/lib/api/with-route'
import { createServiceRoleClient } from '@/lib/supabase'
import { EmailAutomationsService } from '@/lib/notifications/automations/service'
import { enqueueNotificationItem } from '@/lib/notifications/queue/processor'
import { getDueCardsCount } from '@/lib/flashcards-service'
import { logSystemError } from '@/lib/monitoring/logger'

export const runtime = 'nodejs'

export const POST = withRoute(
  {
    actor: { allow: ['admin'] },
    operation: 'admin.emails.automations.run_now.post',
    domain: 'admin',
    summary: 'Unexpected failure in POST /api/admin/emails/automations/run-now',
  },
  async ({ request, actor }) => {
    const admin = requireAdmin(actor)

    let body: { type?: string }
    // Targeted parse: bad JSON is a client validation error, not a server fault.
    try {
      body = (await request.json()) as { type?: string }
    } catch {
      throw new RouteError(400, 'VALIDATION', 'Invalid JSON body')
    }

    const { type } = body

    if (!type || !['weekly_recap', 'daily_reminder'].includes(type)) {
      throw new RouteError(400, 'VALIDATION', "type must be 'weekly_recap' or 'daily_reminder'")
    }

    const isGlobalPause = await EmailAutomationsService.isGlobalPauseActive()
    if (isGlobalPause) {
      throw new RouteError(400, 'PAUSED', 'Cannot run digest while Global Email Pause is active.')
    }

    const supabase = createServiceRoleClient()
    let queuedCount = 0

    if (type === 'weekly_recap') {
      const isEnabled = await EmailAutomationsService.isAutomationEnabled('learning.weekly_recap')
      if (!isEnabled) {
        throw new RouteError(400, 'DISABLED', 'Weekly recap automation is currently disabled in settings.')
      }

      const { data: rawUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email, name, total_xp, current_streak')
        .not('email', 'is', null)
        .limit(100)

      if (usersError) {
        throw new Error(`Failed to fetch weekly recap recipients: ${usersError.message}`)
      }

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
        throw new RouteError(400, 'DISABLED', 'Daily reminder automation is currently disabled in settings.')
      }

      const { data: rawUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email, name, current_streak')
        .gt('current_streak', 0)
        .not('email', 'is', null)
        .limit(100)

      if (usersError) {
        throw new Error(`Failed to fetch daily reminder recipients: ${usersError.message}`)
      }

      const users = (rawUsers || []) as Array<{ id: string; email: string; name?: string; current_streak?: number }>
      const todayDate = new Date().toISOString().slice(0, 10)

      for (const user of users) {
        if (!user.email) continue

        // Phase 7 (7.4): use the REAL due-card count from SRS engine.
        // Reason for try/catch: SRS due-card lookup failure for an individual user is best-effort;
        // suppress that user's notification and continue batch without aborting the whole run.
        let dueCount = 0
        try {
          dueCount = await getDueCardsCount(supabase, user.id)
        } catch (dueErr) {
          void logSystemError({
            severity: 'warning',
            category: 'system',
            operation: 'admin_run_now_due_cards',
            message: dueErr instanceof Error ? dueErr.message : 'Due cards count failed',
            userId: user.id,
          })
          continue
        }
        if (dueCount <= 0) continue

        const result = await enqueueNotificationItem({
          userId: user.id,
          toEmail: user.email,
          toName: user.name || user.email.split('@')[0],
          channel: 'email',
          templateKey: 'learning.daily_reminder',
          templateVariables: {
            userName: user.name || user.email.split('@')[0],
            currentStreak: user.current_streak || 1,
            dueCount,
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
      admin.userId,
      admin.email || 'admin@prodily.me',
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
  }
)
