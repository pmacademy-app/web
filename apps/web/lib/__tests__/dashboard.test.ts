/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import {
  resolveRange,
  eachDay,
  toDateKey,
  countByDay,
  countDistinctByDay,
  buildLearnerSeries,
  buildLearningSeries,
  mergeSeries,
  buildFunnel,
  computeTrend,
} from '../admin/dashboard-aggregation'

const TZ = 'UTC'

const createMockChain = (table: string) => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    not: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => {
      if (table === 'users') {
        resolve({
          data: [
            { id: 'user-1', name: 'Alice PM', email: 'alice@example.com', total_xp: 150, created_at: new Date().toISOString() },
            { id: 'user-2', name: 'Bob PM', email: 'bob@example.com', total_xp: 200, created_at: new Date().toISOString() },
          ],
          count: 2,
          error: null,
        })
      } else if (table === 'xp_events') {
        resolve({
          data: [
            { user_id: 'user-1', xp_amount: 50, created_at: new Date().toISOString() },
          ],
          count: 1,
          error: null,
        })
      } else if (table === 'user_lesson_progress') {
        resolve({
          data: [
            { user_id: 'user-1', lesson_id: 'les_foundations_01', completed_at: new Date().toISOString() },
          ],
          count: 1,
          error: null,
        })
      } else if (table === 'quiz_attempts') {
        resolve({
          data: [{ id: 'q-1', user_id: 'user-1', attempted_at: new Date().toISOString() }],
          count: 1,
          error: null,
        })
      } else if (table === 'capstone_submissions') {
        resolve({
          data: [{ id: 'c-1', user_id: 'user-1', module_slug: 'foundations', submitted_at: new Date().toISOString() }],
          count: 1,
          error: null,
        })
      } else if (table === 'certificates') {
        resolve({
          data: [{ id: 'cert-1', user_id: 'user-1', learner_name: 'Alice', issued_at: new Date().toISOString(), certificate_code: 'CERT-001' }],
          count: 1,
          error: null,
        })
      } else {
        resolve({ data: [], count: 0, error: null })
      }
    },
  }
  return chain
}

vi.mock('../supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createMockChain(table)),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'RPC not found' } })),
    auth: {
      admin: {
        listUsers: vi.fn(() =>
          Promise.resolve({
            data: {
              users: [
                { id: 'user-1', email: 'alice@example.com', email_confirmed_at: new Date().toISOString() },
              ],
            },
            error: null,
          })
        ),
      },
    },
  })),
  createBrowserSupabaseClient: vi.fn(),
  createAuthenticatedServerClient: vi.fn(),
}))

describe('Dashboard Aggregation Unit Test Suite', () => {
  describe('Range Resolution', () => {
    it('resolveRange resolves 7d to a 7-day inclusive window', () => {
      const range = resolveRange('7d', null, null, TZ)
      expect(range.key).toBe('7d')
      expect(eachDay(range).length).toBe(7)
    })

    it('resolveRange resolves today to a single-day window', () => {
      const range = resolveRange('today', null, null, TZ)
      expect(eachDay(range).length).toBe(1)
      expect(range.start.getTime()).toBeLessThanOrEqual(range.end.getTime())
    })

    it('resolveRange resolves 30d and 90d windows', () => {
      expect(eachDay(resolveRange('30d', null, null, TZ)).length).toBe(30)
      expect(eachDay(resolveRange('90d', null, null, TZ)).length).toBe(90)
    })

    it('resolveRange custom uses provided bounds', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-05', TZ)
      expect(eachDay(range).length).toBe(5)
      expect(toDateKey(range.start, TZ)).toBe('2026-08-01')
      expect(toDateKey(range.end, TZ)).toBe('2026-08-05')
    })

    it('resolveRange custom end is inclusive of the full last day', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-05', TZ)
      expect(range.end.toISOString()).toBe('2026-08-05T23:59:59.999Z')
      const rows = [{ at: '2026-08-05T23:59:00Z' }]
      const counts = countByDay(rows, (r) => r.at, range)
      expect(counts.get('2026-08-05')).toBe(1)
    })

    it('resolveRange custom normalizes an inverted range (from > to)', () => {
      const range = resolveRange('custom', '2026-08-10', '2026-08-01', TZ)
      expect(toDateKey(range.start, TZ)).toBe('2026-08-01')
      expect(toDateKey(range.end, TZ)).toBe('2026-08-10')
      expect(eachDay(range).length).toBe(10)
      expect(range.start.toISOString()).toBe('2026-08-01T00:00:00.000Z')
      expect(range.end.toISOString()).toBe('2026-08-10T23:59:59.999Z')
      const rows = [{ at: '2026-08-10T23:59:00Z' }]
      const counts = countByDay(rows, (r) => r.at, range)
      expect(counts.get('2026-08-10')).toBe(1)
    })

    it('resolveRange custom falls back to 30d when bounds are missing', () => {
      const range = resolveRange('custom', null, null, TZ)
      expect(eachDay(range).length).toBe(30)
    })
  })

  describe('Day Bucketing Math', () => {
    it('countByDay buckets rows into calendar days', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-03', TZ)
      const rows = [
        { at: '2026-08-01T10:00:00Z' },
        { at: '2026-08-01T22:00:00Z' },
        { at: '2026-08-02T05:00:00Z' },
        { at: '2026-08-09T05:00:00Z' },
      ]
      const counts = countByDay(rows, (r) => r.at, range)
      expect(counts.get('2026-08-01')).toBe(2)
      expect(counts.get('2026-08-02')).toBe(1)
      expect(counts.get('2026-08-03')).toBe(0)
    })

    it('countByDay buckets by the range timezone, not UTC', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-02', 'Europe/Paris')
      const rows = [{ at: '2026-08-01T23:30:00Z' }]
      const counts = countByDay(rows, (r) => r.at, range)
      expect(counts.get('2026-08-01')).toBe(0)
      expect(counts.get('2026-08-02')).toBe(1)
    })

    it('countDistinctByDay counts unique values per day', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-02', TZ)
      const rows = [
        { user_id: 'a', at: '2026-08-01T10:00:00Z' },
        { user_id: 'a', at: '2026-08-01T12:00:00Z' },
        { user_id: 'b', at: '2026-08-01T14:00:00Z' },
        { user_id: 'c', at: '2026-08-02T09:00:00Z' },
      ]
      const sets = countDistinctByDay(rows, (r) => r.at, (r) => r.user_id, range)
      expect(sets.get('2026-08-01')?.size).toBe(2)
      expect(sets.get('2026-08-02')?.size).toBe(1)
    })
  })

  describe('Series & Funnel Construction', () => {
    it('buildLearnerSeries computes new/active/returning per day', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-02', TZ)
      const series = buildLearnerSeries({
        range,
        newUsers: [{ created_at: '2026-08-01T09:00:00Z' }, { created_at: '2026-08-02T09:00:00Z' }],
        xpEvents: [
          { user_id: 'a', created_at: '2026-08-01T10:00:00Z' },
          { user_id: 'b', created_at: '2026-08-01T11:00:00Z' },
          { user_id: 'a', created_at: '2026-08-02T10:00:00Z' },
        ],
        usersActiveBeforeWindow: new Set(['a']),
      })

      expect(series.length).toBe(2)
      expect(series[0].newUsers).toBe(1)
      expect(series[0].activeLearners).toBe(2)
      expect(series[0].returningLearners).toBe(1)
      expect(series[1].newUsers).toBe(1)
      expect(series[1].activeLearners).toBe(1)
      expect(series[1].returningLearners).toBe(1)
    })

    it('buildLearningSeries buckets lessons/quizzes/capstones', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-01', TZ)
      const series = buildLearningSeries({
        range,
        lessonsCompleted: [{ completed_at: '2026-08-01T10:00:00Z' }, { completed_at: '2026-08-01T11:00:00Z' }],
        quizAttempts: [{ attempted_at: '2026-08-01T12:00:00Z' }],
        capstonesSubmitted: [{ submitted_at: '2026-08-01T13:00:00Z' }],
      })
      expect(series[0].lessonsCompleted).toBe(2)
      expect(series[0].quizAttempts).toBe(1)
      expect(series[0].capstonesSubmitted).toBe(1)
    })

    it('mergeSeries combines learner and learning series by date', () => {
      const range = resolveRange('custom', '2026-08-01', '2026-08-01', TZ)
      const learner = buildLearnerSeries({
        range,
        newUsers: [{ created_at: '2026-08-01T09:00:00Z' }],
        xpEvents: [],
        usersActiveBeforeWindow: new Set(),
      })
      const learning = buildLearningSeries({
        range,
        lessonsCompleted: [{ completed_at: '2026-08-01T10:00:00Z' }],
        quizAttempts: [],
        capstonesSubmitted: [],
      })
      const merged = mergeSeries(learner, learning)
      expect(merged.length).toBe(1)
      expect(merged[0].newUsers).toBe(1)
      expect(merged[0].lessonsCompleted).toBe(1)
    })

    it('buildFunnel computes conversion percentages', () => {
      const funnel = buildFunnel([
        { key: 'registered', label: 'Registered', count: 1000 },
        { key: 'onboarding', label: 'Onboarding', count: 800 },
        { key: 'first_lesson', label: 'First Lesson', count: 400 },
        { key: 'certificate', label: 'Certificate', count: 100 },
      ])
      expect(funnel[0].pctOfPrevious).toBeNull()
      expect(funnel[0].pctOverall).toBe(100)
      expect(funnel[1].pctOfPrevious).toBe(80)
      expect(funnel[1].pctOverall).toBe(80)
      expect(funnel[2].pctOfPrevious).toBe(50)
      expect(funnel[2].pctOverall).toBe(40)
      expect(funnel[3].pctOfPrevious).toBe(25)
      expect(funnel[3].pctOverall).toBe(10)
    })

    it('computeTrend returns percentage delta or null', () => {
      expect(computeTrend(120, 100)).toBe(20)
      expect(computeTrend(80, 100)).toBe(-20)
      expect(computeTrend(100, 0)).toBeNull()
      expect(computeTrend(100, null)).toBeNull()
    })
  })

  describe('DashboardService Integration', () => {
    it('DashboardService.getDashboardSummary executes cleanly without cache invariant crashes', async () => {
      const { DashboardService } = await import('../admin/dashboard-service')
      const summary = await DashboardService.getDashboardSummary()
      expect(summary).toBeDefined()
      expect(typeof summary.totalUsers).toBe('number')
      expect(typeof summary.totalXpAwarded).toBe('number')
      expect(typeof summary.activeLearners7d).toBe('number')
    })

    it('DashboardService.getDashboardData returns full KPI and series structure', async () => {
      const { DashboardService } = await import('../admin/dashboard-service')
      const data = await DashboardService.getDashboardData('30d', null, null)
      expect(data).toBeDefined()
      expect(data.kpis).toBeDefined()
      expect(typeof data.kpis.totalUsers).toBe('number')
      expect(typeof data.kpis.activeLearners).toBe('number')
      expect(Array.isArray(data.series)).toBe(true)
      expect(Array.isArray(data.funnel)).toBe(true)
      expect(Array.isArray(data.recentActivity)).toBe(true)
      expect(Array.isArray(data.systemSnapshot)).toBe(true)
    })
  })
})