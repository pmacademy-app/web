import { describe, it, expect } from 'vitest'
import {
  STREAK_BUCKETS,
  LEVEL_TIERS,
  buildStreakDistribution,
  computeActiveUserMetrics,
  computeModuleCompletionPct,
  computeNewVsReturning,
  computeLevelDistribution,
  computeXpBySource,
  computeQuizPerformanceStats,
  computeModuleDropOffs,
  buildDailyXpSeries,
  buildCertificateSeries,
} from '../admin/analytics-aggregation'
import { resolveRange } from '../admin/dashboard-aggregation'

const NOW = new Date('2026-08-15T12:00:00.000Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()

describe('Analytics & Insights Aggregation Unit Test Suite', () => {
  describe('Active User Metrics', () => {
    it('computeActiveUserMetrics counts distinct learners per trailing window', () => {
      const events = [
        { user_id: 'u1', created_at: hoursAgo(1) },
        { user_id: 'u2', created_at: hoursAgo(12) },
        { user_id: 'u3', created_at: hoursAgo(48) },
        { user_id: 'u4', created_at: hoursAgo(10 * 24) },
        { user_id: 'u5', created_at: hoursAgo(40 * 24) },
        { user_id: 'u1', created_at: hoursAgo(2) },
      ]
      const { dau, wau, mau } = computeActiveUserMetrics(events, NOW)
      expect(dau).toBe(2)
      expect(wau).toBe(3)
      expect(mau).toBe(4)
    })

    it('computeActiveUserMetrics handles empty input', () => {
      const { dau, wau, mau } = computeActiveUserMetrics([], NOW)
      expect(dau).toBe(0)
      expect(wau).toBe(0)
      expect(mau).toBe(0)
    })
  })

  describe('New vs Returning', () => {
    it('computeNewVsReturning splits the active set correctly', () => {
      const result = computeNewVsReturning({
        activeUserIds: new Set(['u1', 'u2', 'u3']),
        usersActiveBeforeWindow: new Set(['u1', 'u3']),
      })
      expect(result.returningLearners).toBe(2)
      expect(result.newLearners).toBe(1)
    })
  })

  describe('Streak Distribution', () => {
    it('buildStreakDistribution buckets users and preserves bucket order', () => {
      const users = [
        { current_streak: 0 },
        { current_streak: null },
        { current_streak: undefined },
        { current_streak: 2 },
        { current_streak: 5 },
        { current_streak: 12 },
        { current_streak: 20 },
        { current_streak: 45 },
      ]
      const buckets = buildStreakDistribution(users)
      expect(buckets.map((b) => b.bucket)).toEqual(STREAK_BUCKETS.map((b) => b.bucket))
      const byBucket = Object.fromEntries(buckets.map((b) => [b.bucket, b.count]))
      expect(byBucket['0 days']).toBe(3)
      expect(byBucket['1–3 days']).toBe(1)
      expect(byBucket['4–7 days']).toBe(1)
      expect(byBucket['8–14 days']).toBe(1)
      expect(byBucket['15–30 days']).toBe(1)
      expect(byBucket['30+ days']).toBe(1)
    })

    it('buildStreakDistribution handles empty input', () => {
      const buckets = buildStreakDistribution([])
      expect(buckets.every((b) => b.count === 0)).toBe(true)
      expect(buckets.length).toBe(STREAK_BUCKETS.length)
    })
  })

  describe('Module Completion', () => {
    it('computeModuleCompletionPct averages and clamps', () => {
      expect(computeModuleCompletionPct([])).toBe(0)
      expect(computeModuleCompletionPct([{ completedPct: 50 }, { completedPct: 100 }])).toBe(75)
      expect(computeModuleCompletionPct([{ completedPct: 120 }])).toBe(100)
    })
  })

  describe('Level Distribution', () => {
    it('computeLevelDistribution calculates counts and percentages accurately', () => {
      const users = [
        { level: 1 },
        { level: 1 },
        { level: 2 },
        { level: 3 },
        { level: null },
        { level: 5 },
        { level: 10 },
      ]
      const levels = computeLevelDistribution(users)
      expect(levels.length).toBe(LEVEL_TIERS.length)

      const byLvl = Object.fromEntries(levels.map((l) => [l.level, l]))
      expect(byLvl[1].count).toBe(3)
      expect(byLvl[2].count).toBe(1)
      expect(byLvl[3].count).toBe(1)
      expect(byLvl[4].count).toBe(0)
      expect(byLvl[5].count).toBe(2)

      const totalPct = levels.reduce((sum, l) => sum + l.percentage, 0)
      expect(totalPct).toBeGreaterThanOrEqual(99.5)
      expect(totalPct).toBeLessThanOrEqual(100.5)
    })

    it('computeLevelDistribution handles empty users list', () => {
      const levels = computeLevelDistribution([])
      expect(levels.length).toBe(5)
      expect(levels.every((l) => l.count === 0 && l.percentage === 0)).toBe(true)
    })
  })

  describe('XP by Source', () => {
    it('computeXpBySource groups and calculates percentages in descending order', () => {
      const events = [
        { source: 'lesson', xp_amount: 100 },
        { source: 'lesson', xp_amount: 50 },
        { source: 'quiz', xp_amount: 50 },
        { source: 'streak', xp_amount: 25 },
        { source: 'unknown_custom_source', xp_amount: 25 },
      ]
      const sources = computeXpBySource(events)
      expect(sources.length).toBeGreaterThan(0)
      expect(sources[0].source).toBe('lesson')
      expect(sources[0].xp).toBe(150)
      expect(sources[0].percentage).toBe(60)

      expect(sources[1].source).toBe('quiz')
      expect(sources[1].xp).toBe(50)
      expect(sources[1].percentage).toBe(20)

      for (let i = 1; i < sources.length; i++) {
        expect(sources[i - 1].xp).toBeGreaterThanOrEqual(sources[i].xp)
      }
    })

    it('computeXpBySource handles empty events array', () => {
      const sources = computeXpBySource([])
      expect(sources).toEqual([])
    })
  })

  describe('Quiz Performance Stats', () => {
    it('computeQuizPerformanceStats computes pass rate and score distribution', () => {
      const attempts = [
        { is_correct: true, score: 95 },
        { is_correct: true, score: 85 },
        { is_correct: false, score: 60 },
        { is_correct: false, score: 40 },
      ]
      const stats = computeQuizPerformanceStats(attempts)
      expect(stats.totalAttempts).toBe(4)
      expect(stats.passedAttempts).toBe(2)
      expect(stats.passRatePct).toBe(50)
      expect(stats.avgScorePct).toBe(70)

      const buckets = Object.fromEntries(stats.scoreDistribution.map((b) => [b.range, b.count]))
      expect(buckets['90–100%']).toBe(1)
      expect(buckets['70–89%']).toBe(1)
      expect(buckets['50–69%']).toBe(1)
      expect(buckets['0–49%']).toBe(1)
    })

    it('computeQuizPerformanceStats handles empty attempts array', () => {
      const stats = computeQuizPerformanceStats([])
      expect(stats.totalAttempts).toBe(0)
      expect(stats.passedAttempts).toBe(0)
      expect(stats.passRatePct).toBe(0)
      expect(stats.avgScorePct).toBeNull()
      expect(stats.scoreDistribution.every((b) => b.count === 0)).toBe(true)
    })
  })

  describe('Module Drop-Off Analysis', () => {
    it('computeModuleDropOffs calculates started, completed and drop-off rates', () => {
      const modules = [
        { slug: 'mod-1', title: 'Module 1', order: 1, lessonIds: ['l1', 'l2'] },
        { slug: 'mod-2', title: 'Module 2', order: 2, lessonIds: ['l3', 'l4'] },
      ]
      const completions = [
        { user_id: 'u1', lesson_id: 'l1' },
        { user_id: 'u1', lesson_id: 'l2' },
        { user_id: 'u1', lesson_id: 'l3' },
        { user_id: 'u1', lesson_id: 'l4' },
        { user_id: 'u2', lesson_id: 'l1' },
        { user_id: 'u2', lesson_id: 'l2' },
        { user_id: 'u3', lesson_id: 'l1' },
      ]
      const dropOffs = computeModuleDropOffs(modules, completions, 3)
      expect(dropOffs.length).toBe(2)

      expect(dropOffs[0].learnersStarted).toBe(3)
      expect(dropOffs[0].learnersCompleted).toBe(2)
      expect(dropOffs[0].completionPct).toBe(66.7)

      expect(dropOffs[1].learnersStarted).toBe(1)
      expect(dropOffs[1].learnersCompleted).toBe(1)
      expect(dropOffs[1].completionPct).toBe(100)
    })
  })

  describe('Time-Series Series Bucketing', () => {
    it('buildDailyXpSeries buckets events across range days', () => {
      const range = resolveRange('7d', null, null, 'UTC')
      const startDay = new Date(range.start).toISOString()
      const events = [
        { xp_amount: 100, created_at: startDay },
        { xp_amount: 50, created_at: startDay },
      ]
      const series = buildDailyXpSeries(events, range)
      expect(series.length).toBe(7)
      expect(series[0].xp).toBe(150)
    })

    it('buildCertificateSeries buckets certificates across range days', () => {
      const range = resolveRange('7d', null, null, 'UTC')
      const startDay = new Date(range.start).toISOString()
      const certs = [
        { issued_at: startDay },
        { issued_at: startDay },
      ]
      const series = buildCertificateSeries(certs, range)
      expect(series.length).toBe(7)
      expect(series[0].count).toBe(2)
    })
  })
})