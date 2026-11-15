/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { goalUpdateSchema } from '@/lib/api/contracts/settings'
import { WeeklyRecap } from '@/emails/templates/learning/WeeklyRecap'
import { evaluateWeeklyGoalNudge, getIsoWeekKey } from '@/lib/growth/weekly-goal-nudge'
import React from 'react'
import { renderToString } from 'react-dom/server'

vi.mock('@/lib/notifications/in-app/service', () => ({
  createInAppNotification: vi.fn().mockImplementation(async ({ idempotencyKey }) => {
    return { success: true, id: `notif-${idempotencyKey}` }
  }),
}))

describe('PROD-06 / AG-29: Weekly goal and outcome-based recap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Goal validation', () => {
    it('accepts valid goals and session minutes', () => {
      const valid1 = goalUpdateSchema.safeParse({ weekly_goal_lessons: 3, session_minutes: 20 })
      expect(valid1.success).toBe(true)

      const valid2 = goalUpdateSchema.safeParse({ weekly_goal_lessons: 1, session_minutes: 10 })
      expect(valid2.success).toBe(true)

      const valid3 = goalUpdateSchema.safeParse({ weekly_goal_lessons: 7, session_minutes: 60 })
      expect(valid3.success).toBe(true)

      const validNull = goalUpdateSchema.safeParse({ weekly_goal_lessons: null, session_minutes: null })
      expect(validNull.success).toBe(true)
    })

    it('rejects invalid weekly_goal_lessons', () => {
      expect(goalUpdateSchema.safeParse({ weekly_goal_lessons: 0 }).success).toBe(false)
      expect(goalUpdateSchema.safeParse({ weekly_goal_lessons: 8 }).success).toBe(false)
      expect(goalUpdateSchema.safeParse({ weekly_goal_lessons: 2.5 }).success).toBe(false)
    })

    it('rejects invalid session_minutes', () => {
      expect(goalUpdateSchema.safeParse({ session_minutes: 25 }).success).toBe(false)
      expect(goalUpdateSchema.safeParse({ session_minutes: 5 }).success).toBe(false)
      expect(goalUpdateSchema.safeParse({ session_minutes: 90 }).success).toBe(false)
    })
  })

  describe('2. Weekly recap template output', () => {
    it('renders default recap with streak when no goal is set', () => {
      const html = renderToString(
        React.createElement(WeeklyRecap, {
          userName: 'Ada',
          lessonsCompletedThisWeek: 2,
          xpEarnedThisWeek: 60,
          currentStreak: 5,
          daysStudiedThisWeek: 3,
        })
      )

      expect(html).toContain('5 Days')
      expect(html).toContain('Current Streak')
      expect(html).not.toContain('Weekly Goal')
      expect(html).toContain('here is a look at your learning progress')
    })

    it('renders goal progress and met message when goal is reached', () => {
      const html = renderToString(
        React.createElement(WeeklyRecap, {
          userName: 'Ada',
          lessonsCompletedThisWeek: 3,
          weeklyGoalLessons: 3,
          xpEarnedThisWeek: 90,
          currentStreak: 5,
          daysStudiedThisWeek: 4,
        })
      )

      expect(html).toContain('you finished 3 of your 3 lessons this week! You met your weekly goal.')
      expect(html).toContain('Weekly Goal')
      expect(html).toContain('3 / 3 Lessons')
      expect(html).not.toContain('Current Streak')
    })

    it('renders goal progress and encouraging message when goal is partly met', () => {
      const html = renderToString(
        React.createElement(WeeklyRecap, {
          userName: 'Ada',
          lessonsCompletedThisWeek: 2,
          weeklyGoalLessons: 5,
          xpEarnedThisWeek: 60,
          currentStreak: 4,
          daysStudiedThisWeek: 3,
        })
      )

      expect(html).toContain('you finished 2 of your 5 lessons this week. Keep going to reach your goal next week!')
      expect(html).toContain('Weekly Goal')
      expect(html).toContain('2 / 5 Lessons')
      expect(html).not.toContain('Current Streak')
    })
  })

  describe('3. Weekly goal in-app nudge evaluation', () => {
    function createMockSupabase(userRecord: any, progressRows: any[]) {
      const client: any = {
        from: vi.fn((table: string) => ({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (table === 'users') return { data: userRecord, error: null }
            return { data: null, error: null }
          }),
          then: vi.fn().mockImplementation((resolve) => {
            if (table === 'user_lesson_progress') {
              resolve({ data: progressRows, error: null })
            } else {
              resolve({ data: [], error: null })
            }
          }),
        })),
      }
      return client
    }

    it('does not fire if learner has no goal set', async () => {
      const fake = createMockSupabase({ weekly_goal_lessons: null, timezone: 'UTC' }, [])
      const thursdayDate = new Date('2026-11-19T14:00:00Z') // Thursday

      const result = await evaluateWeeklyGoalNudge(fake, 'user-1', thursdayDate)
      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('no_goal')
    })

    it('does not fire before Thursday local time', async () => {
      const fake = createMockSupabase({ weekly_goal_lessons: 4, timezone: 'UTC' }, [])
      const wednesdayDate = new Date('2026-11-18T14:00:00Z') // Wednesday

      const result = await evaluateWeeklyGoalNudge(fake, 'user-1', wednesdayDate)
      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('not_thursday_yet')
    })

    it('does not fire if learner is on track (completed >= half goal)', async () => {
      const fake = createMockSupabase(
        { weekly_goal_lessons: 4, timezone: 'UTC' },
        [{ lesson_id: 'les_1' }, { lesson_id: 'les_2' }]
      )
      const thursdayDate = new Date('2026-11-19T14:00:00Z') // Thursday

      const result = await evaluateWeeklyGoalNudge(fake, 'user-1', thursdayDate)
      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('on_track')
      expect(result.completed).toBe(2)
    })

    it('fires in-app nudge when learner is under half goal starting Thursday', async () => {
      const fake = createMockSupabase(
        { weekly_goal_lessons: 4, timezone: 'UTC' },
        [{ lesson_id: 'les_1' }] // 1 completed out of 4 (half is 2)
      )
      const thursdayDate = new Date('2026-11-19T14:00:00Z')

      const result = await evaluateWeeklyGoalNudge(fake, 'user-1', thursdayDate)
      expect(result.eligible).toBe(true)
      expect(result.queued).toBe(true)
      expect(result.completed).toBe(1)
      expect(result.goal).toBe(4)
    })

    it('computes correct ISO week key for idempotency', () => {
      const d1 = new Date('2026-11-19T14:00:00Z')
      const key1 = getIsoWeekKey(d1)
      expect(key1).toBe('2026-W47')

      const d2 = new Date('2026-11-20T10:00:00Z')
      const key2 = getIsoWeekKey(d2)
      expect(key2).toBe('2026-W47')
    })
  })
})
