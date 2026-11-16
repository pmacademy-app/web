import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import { createInAppNotification } from '../notifications/in-app/service'
import { getUserLocalTime } from '../notifications/timezone'

export interface WeeklyGoalNudgeResult {
  eligible: boolean
  reason?: string
  queued?: boolean
  completed?: number
  goal?: number
}

/**
 * Computes ISO week key: YYYY-Www, e.g. "2026-W46".
 */
export function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/**
 * Evaluates whether a learner is eligible for a "goal at risk" in-app nudge.
 * Triggered starting Thursday local time if the learner is under half their weekly goal.
 * At most once per week via a unique idempotency key.
 */
export async function evaluateWeeklyGoalNudge(
  supabase: SupabaseClient<Database>,
  userId: string,
  now = new Date()
): Promise<WeeklyGoalNudgeResult> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('weekly_goal_lessons, timezone')
    .eq('id', userId)
    .maybeSingle()

  if (userError || !user) {
    return { eligible: false, reason: 'user_not_found' }
  }

  const goal = user.weekly_goal_lessons
  if (!goal || goal <= 0) {
    return { eligible: false, reason: 'no_goal' }
  }

  const localTime = getUserLocalTime(user.timezone || 'UTC', now)
  // 0 is Sunday, 1 Monday, 2 Tuesday, 3 Wednesday, 4 Thursday, 5 Friday, 6 Saturday
  if (localTime.localDayOfWeek < 4) {
    return { eligible: false, reason: 'not_thursday_yet' }
  }

  const weekKey = getIsoWeekKey(now)
  const daysSinceMonday = (localTime.localDayOfWeek + 6) % 7
  const weekStartDate = new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000)
  weekStartDate.setHours(0, 0, 0, 0)

  const { data: progressRows, error: progressError } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .gte('completed_at', weekStartDate.toISOString())

  if (progressError) {
    return { eligible: false, reason: 'progress_read_error' }
  }

  const completed = (progressRows || []).length
  const halfGoal = Math.ceil(goal / 2)

  if (completed >= halfGoal) {
    return { eligible: false, reason: 'on_track', completed, goal }
  }

  const idempotencyKey = `weekly-goal-nudge-${userId}-${weekKey}`

  const notifResult = await createInAppNotification({
    userId,
    category: 'learning',
    priority: 'medium',
    title: 'Weekly Goal Check-in',
    body: `You have finished ${completed} of your ${goal} lessons this week. Keep going to reach your goal!`,
    actionUrl: '/dashboard',
    idempotencyKey,
  })

  return {
    eligible: true,
    queued: notifResult.success,
    completed,
    goal,
  }
}
