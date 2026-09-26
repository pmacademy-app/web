import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'
import {
  getReviewQueueData,
  recordBatchFlashcardReviews,
  getDueCardsCount,
} from '../flashcards-service'
import { SystemService } from '../admin/system-service'
import { processEmailQueue } from '../notifications/queue/processor'
import { calculateSM2, SRSRating } from '../srs'

// Mock lesson loader for curriculum and compiled lesson data
vi.mock('../lesson-loader', () => ({
  fetchCurriculumData: vi.fn().mockResolvedValue({
    lessons: [
      { id: 'les_091713', title: 'Writing Great PRDs', module: 'execution', slug: 'lesson-010' },
      { id: 'les_4kpbq6', title: 'User Research', module: 'discovery', slug: 'lesson-011' },
      { id: 'les_zoyq8a', title: 'What is Product Management?', module: 'foundations', slug: 'lesson-001' },
    ],
  }),
  fetchCompiledLesson: vi.fn().mockImplementation(async (lessonId: string) => {
    if (lessonId === 'les_091713') {
      return {
        id: 'les_091713',
        title: 'Writing Great PRDs',
        module: 'execution',
        blocks: [
          {
            type: 'flashcardDeck',
            id: 'fc-deck-les_091713',
            cards: [
              { id: 'fc-les_091713-1', front: 'Agile Origin', back: 'Iterative feedback' },
              { id: 'fc-les_091713-2', front: 'Agile Manifesto', back: '4 values' },
            ],
          },
        ],
      }
    }
    if (lessonId === 'les_4kpbq6') {
      return {
        id: 'les_4kpbq6',
        title: 'User Research',
        module: 'discovery',
        blocks: [
          {
            type: 'flashcardDeck',
            id: 'fc-deck-les_4kpbq6',
            cards: [
              { id: 'fc-les_4kpbq6-1', front: 'Interview Best Practice', back: 'Ask open questions' },
            ],
          },
        ],
      }
    }
    return {
      id: lessonId,
      title: 'Lesson',
      module: 'foundations',
      blocks: [],
    }
  }),
}))

// Mock feature flags and automations
vi.mock('../notifications/feature-flags/service', () => ({
  globalFeatureFlagService: {
    isEnabledAsync: vi.fn().mockResolvedValue(true),
  },
}))

vi.mock('../notifications/automations/service', () => ({
  EmailAutomationsService: {
    getState: vi.fn().mockResolvedValue({ globalPause: false, dailyLimit: 1000 }),
    isAutomationEnabled: vi.fn().mockResolvedValue(true),
    isGlobalPauseActive: vi.fn().mockResolvedValue(false),
    getDigestSchedules: vi.fn().mockResolvedValue({
      dailyReminder: { enabled: true, hourUtc: 9 },
      weeklyRecap: { enabled: true, dayOfWeek: 1, hourUtc: 9 },
    }),
    recordDigestRun: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('../supabase', () => {
  return {
    createServiceRoleClient: vi.fn(),
  }
})

describe('Phase T3 — Performance & Query Architecture Suite', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // T3.1 — Notification Queue Pagination & Batch Worker Sizing
  // ──────────────────────────────────────────────────────────────────────────
  describe('T3.1: Notification Queue Pagination & Sizing', () => {
    it('supports bounded multi-batch queue draining via processEmailQueue options', async () => {
      const { createServiceRoleClient } = await import('../supabase')
      let callCount = 0

      // Mock service role client with RPC claiming
      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'claim_email_queue_items') {
            callCount++
            // First 2 batches return full batch, 3rd returns fewer to signal queue drained
            if (callCount <= 2) {
              const items = Array.from({ length: 50 }, (_, i) => ({
                id: `queue-${callCount}-${i}`,
                user_id: `user-${i}`,
                to_email: `user${i}@example.com`,
                template_key: 'learning.daily_reminder',
                template_variables: { userName: `User ${i}` },
                attempt_count: 1,
                max_attempts: 3,
                status: 'processing',
              }))
              return Promise.resolve({ data: items, error: null })
            } else {
              return Promise.resolve({ data: [], error: null })
            }
          }
          if (fn === 'reclaim_stale_processing_items') {
            return Promise.resolve({ data: [], error: null })
          }
          if (fn === 'increment_daily_email_quota') {
            return Promise.resolve({ data: true, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: { id: 'mock' }, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServiceRoleClient>)

      const result = await processEmailQueue(50, { maxBatches: 5, maxExecutionMs: 30_000 })

      // Processed 2 full batches (50 + 50 = 100), stopped when batch 3 returned 0
      expect(result.processed).toBe(100)
      expect(callCount).toBe(3)
    })

    it('defaults to single-batch execution when options are not provided (backwards compatibility)', async () => {
      const { createServiceRoleClient } = await import('../supabase')
      let callCount = 0

      const mockSupabase = {
        rpc: vi.fn().mockImplementation((fn: string) => {
          if (fn === 'claim_email_queue_items') {
            callCount++
            return Promise.resolve({
              data: [
                {
                  id: 'queue-1',
                  user_id: 'user-1',
                  to_email: 'test@example.com',
                  template_key: 'learning.daily_reminder',
                  template_variables: { userName: 'Test' },
                  attempt_count: 1,
                  max_attempts: 3,
                  status: 'processing',
                },
              ],
              error: null,
            })
          }
          return Promise.resolve({ data: [], error: null })
        }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: { id: 'mock' }, error: null }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServiceRoleClient>)

      const result = await processEmailQueue(50)
      expect(result.processed).toBe(1)
      expect(callCount).toBe(1)
    })

    it('processes records beyond the old 100 limit using keyset pagination with cursor and batch preferences', async () => {
      const { createServiceRoleClient } = await import('../supabase')

      // Simulate 150 eligible users in the database
      const allEligibleUsers = Array.from({ length: 150 }, (_, i) => ({
        id: `user-${String(i).padStart(4, '0')}`,
        email: `user${i}@example.com`,
        name: `User ${i}`,
        current_streak: i + 1,
      }))

      let queriesExecuted = 0
      const queryCursors: Array<string | null> = []
      const enqueuedKeys: string[] = []

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          let gtId: string | null = null

          const qb = {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockImplementation((f: string, v: unknown) => {
              if (f === 'id') gtId = String(v)
              return qb
            }),
            not: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation((limitNum: number) => {
              queriesExecuted++
              queryCursors.push(gtId)
              let slice = [...allEligibleUsers]
              if (gtId) {
                slice = slice.filter((u) => u.id > gtId!)
              }
              const resultRows = slice.slice(0, limitNum)
              return Promise.resolve({ data: resultRows, error: null })
            }),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
            insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              if (payload.idempotency_key) {
                enqueuedKeys.push(String(payload.idempotency_key))
              }
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'queue-new' }, error: null }),
                }),
              }
            }),
            then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
              if (table === 'user_notification_preferences') {
                return resolve({
                  data: allEligibleUsers.map((u) => ({
                    user_id: u.id,
                    all_notifications: true,
                    all_email: true,
                    learning_email: true,
                  })),
                  error: null,
                })
              }
              return resolve({ data: [], error: null })
            }),
          }
          return qb
        }),
      }

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServiceRoleClient>)

      const { POST: dailyReminderRoute } = await import('../../app/api/cron/daily-reminder/route')
      const req = new Request('http://localhost:3000/api/cron/daily-reminder?force=true', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET || 'test'}` },
      })

      const res = await dailyReminderRoute(req)
      const data = await res.json()

      expect(data.success).toBe(true)
      // Both pages processed: 100 on page 1, 50 on page 2 = 150 total (eliminating 100-record starvation)
      expect(data.remindersQueued).toBe(150)
      expect(queriesExecuted).toBe(2)
      // Page 1 has no cursor (null), Page 2 has cursor at lastSeenId of user 99
      expect(queryCursors[0]).toBeNull()
      expect(queryCursors[1]).toBe(allEligibleUsers[99].id)
      // Deterministic idempotency keys were generated for every user
      expect(enqueuedKeys.length).toBe(150)
      expect(enqueuedKeys[0]).toMatch(/^daily-reminder-user-0000-\d{4}-\d{2}-\d{2}$/)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T3.2 — Admin Audit Log Query Scalability
  // ──────────────────────────────────────────────────────────────────────────
  describe('T3.2: Admin Audit Log Query Scalability', () => {
    let mockAuditRows: Array<{
      id: string
      admin_user_id: string | null
      admin_email: string
      action: string
      target_resource: string
      target_id: string | null
      metadata: Record<string, unknown> | null
      created_at: string
    }>

    beforeEach(async () => {
      const { createServiceRoleClient } = await import('../supabase')

      // Populate mock audit rows with some sharing timestamps to test tie-breaker
      mockAuditRows = [
        {
          id: 'log-003',
          admin_user_id: 'admin-1',
          admin_email: 'admin@prodily.app',
          action: 'user.delete',
          target_resource: 'user',
          target_id: 'usr-3',
          metadata: { reason: 'abuse' },
          created_at: '2026-09-25T12:00:00.000Z',
        },
        {
          id: 'log-002',
          admin_user_id: 'admin-1',
          admin_email: 'admin@prodily.app',
          action: 'settings.update',
          target_resource: 'settings',
          target_id: null,
          metadata: null,
          created_at: '2026-09-25T12:00:00.000Z', // Same timestamp as log-003
        },
        {
          id: 'log-001',
          admin_user_id: 'admin-2',
          admin_email: 'super@prodily.app',
          action: 'broadcast.send',
          target_resource: 'broadcast',
          target_id: 'bc-1',
          metadata: { recipients: 10 },
          created_at: '2026-09-24T08:00:00.000Z',
        },
      ]

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table !== 'admin_audit_logs') return {}

          let filtered = [...mockAuditRows]
          let limitCount: number | null = null
          const orderClauses: Array<{ col: string; asc: boolean }> = []

          const builder = {
            select: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockImplementation((col: string, val: string) => {
              const term = val.replace(/%/g, '').toLowerCase()
              filtered = filtered.filter((r) => String((r as Record<string, unknown>)[col] || '').toLowerCase().includes(term))
              return builder
            }),
            or: vi.fn().mockImplementation((filterStr: string) => {
              // Mock cursor keyset filter or target filter
              if (filterStr.includes('created_at.lt')) {
                // Keyset cursor condition
                const match = filterStr.match(/created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^)]+)\)/)
                if (match) {
                  const [, cursorTs, , cursorId] = match
                  filtered = filtered.filter((r) => {
                    if (r.created_at < cursorTs) return true
                    if (r.created_at === cursorTs && r.id < cursorId) return true
                    return false
                  })
                }
              }
              return builder
            }),
            gte: vi.fn().mockImplementation((col: string, val: string) => {
              filtered = filtered.filter((r) => (r as Record<string, unknown>)[col] as string >= val)
              return builder
            }),
            lte: vi.fn().mockImplementation((col: string, val: string) => {
              filtered = filtered.filter((r) => (r as Record<string, unknown>)[col] as string <= val)
              return builder
            }),
            order: vi.fn().mockImplementation((col: string, opts?: { ascending?: boolean }) => {
              orderClauses.push({ col, asc: Boolean(opts?.ascending) })
              return builder
            }),
            range: vi.fn().mockImplementation((from: number, to: number) => {
              filtered = filtered.slice(from, to + 1)
              return builder
            }),
            limit: vi.fn().mockImplementation((n: number) => {
              limitCount = n
              return builder
            }),
            then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
              let rows = [...filtered]
              // Sort by recorded order clauses
              if (orderClauses.length > 0) {
                rows.sort((a, b) => {
                  for (const clause of orderClauses) {
                    const valA = (a as Record<string, unknown>)[clause.col] as string
                    const valB = (b as Record<string, unknown>)[clause.col] as string
                    if (valA !== valB) {
                      return clause.asc ? valA.localeCompare(valB) : valB.localeCompare(valA)
                    }
                  }
                  return 0
                })
              }
              if (limitCount !== null) {
                rows = rows.slice(0, limitCount)
              }
              return resolve({ data: rows, count: mockAuditRows.length, error: null })
            }),
          }

          return builder
        }),
      }

      vi.mocked(createServiceRoleClient).mockReturnValue(mockSupabase as unknown as ReturnType<typeof createServiceRoleClient>)
    })

    it('orders audit records with deterministic tie-breaker (created_at DESC, id DESC)', async () => {
      const result = await SystemService.getAuditLog({ page: 1, pageSize: 10 })

      expect(result.entries.length).toBe(3)
      // log-003 and log-002 have identical created_at; log-003 has larger ID so sorts first
      expect(result.entries[0].id).toBe('log-003')
      expect(result.entries[1].id).toBe('log-002')
      expect(result.entries[2].id).toBe('log-001')
    })

    it('supports keyset cursor pagination with stable nextCursor generation', async () => {
      // Fetch first page with pageSize 2 via cursor mechanism
      const page1 = await SystemService.getAuditLog({ pageSize: 2, page: 1 })
      expect(page1.entries.length).toBe(2)
      expect(page1.entries[0].id).toBe('log-003')
      expect(page1.entries[1].id).toBe('log-002')
      expect(page1.nextCursor).toBeDefined()

      // Fetch second page using nextCursor
      const page2 = await SystemService.getAuditLog({ pageSize: 2, cursor: page1.nextCursor! })
      expect(page2.entries.length).toBe(1)
      expect(page2.entries[0].id).toBe('log-001')
    })

    it('normalizes date filters without duplicating ISO timestamps', async () => {
      // Pass ISO string directly
      const resultIso = await SystemService.getAuditLog({
        from: '2026-09-25T00:00:00.000Z',
        to: '2026-09-25T23:59:59.999Z',
      })
      // Pass bare date string
      const resultBare = await SystemService.getAuditLog({
        from: '2026-09-25',
        to: '2026-09-25',
      })

      expect(resultIso.entries.length).toBe(2)
      expect(resultBare.entries.length).toBe(2)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // T3.3 — Flashcard / SRS Batch Aggregation & Query Efficiency
  // ──────────────────────────────────────────────────────────────────────────
  describe('T3.3: Flashcard & SRS Batch Aggregation', () => {
    let mockStore: {
      lessonProgress: { user_id: string; lesson_id: string; status: string }[]
      srs: {
        user_id: string
        lesson_id: string
        flashcard_id: string
        ease_factor: number
        interval_days: number
        repetitions: number
        next_review_at: string
      }[]
      xpEvents: { user_id: string; source_type: string; source_id: string; created_at: string }[]
      updatedStreakUsers: string[]
    }
    let mockSupabase: SupabaseClient<Database>

    beforeEach(() => {
      mockStore = {
        lessonProgress: [{ user_id: 'usr_t3', lesson_id: 'les_091713', status: 'completed' }],
        srs: [],
        xpEvents: [],
        updatedStreakUsers: [],
      }

      mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          const currentTable = table
          const filters: Record<string, unknown> = {}

          const qb = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockImplementation((f: string, v: unknown) => {
              filters[f] = v
              return qb
            }),
            in: vi.fn().mockImplementation((f: string, arr: unknown[]) => {
              filters[`${f}_in`] = arr
              return qb
            }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            range: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(async () => {
              if (currentTable === 'users') {
                return { data: { timezone: 'UTC' }, error: null }
              }
              return { data: null, error: null }
            }),
            maybeSingle: vi.fn().mockImplementation(async () => {
              if (currentTable === 'user_flashcard_srs') {
                const found = mockStore.srs.find(
                  (r) => r.user_id === filters.user_id && r.flashcard_id === filters.flashcard_id
                )
                return { data: found || null, error: null }
              }
              return { data: null, error: null }
            }),
            upsert: vi.fn().mockImplementation(async (payload: unknown) => {
              if (currentTable === 'user_flashcard_srs') {
                const items = Array.isArray(payload) ? payload : [payload]
                for (const item of items) {
                  const existingIdx = mockStore.srs.findIndex(
                    (r) => r.user_id === item.user_id && r.flashcard_id === item.flashcard_id
                  )
                  if (existingIdx >= 0) {
                    mockStore.srs[existingIdx] = { ...mockStore.srs[existingIdx], ...item }
                  } else {
                    mockStore.srs.push(item)
                  }
                }
              }
              return { data: payload, error: null }
            }),
            insert: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
              if (currentTable === 'xp_events') {
                mockStore.xpEvents.push({
                  user_id: String(payload.user_id || ''),
                  source_type: String(payload.source_type || ''),
                  source_id: String(payload.source_id || ''),
                  created_at: String(payload.created_at || new Date().toISOString()),
                })
              }
              return { data: payload, error: null }
            }),
            update: vi.fn().mockImplementation((payload: Record<string, unknown>) => ({
              eq: vi.fn().mockImplementation((f: string, v: unknown) => {
                if (currentTable === 'users' && f === 'id') {
                  mockStore.updatedStreakUsers.push(String(v))
                }
                return Promise.resolve({ data: payload, error: null })
              }),
            })),
            then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
              if (currentTable === 'user_lesson_progress') {
                return resolve({ data: mockStore.lessonProgress.filter((r) => r.user_id === filters.user_id), error: null })
              }
              if (currentTable === 'user_flashcard_srs') {
                let rows = mockStore.srs.filter((r) => r.user_id === filters.user_id)
                if (filters.flashcard_id_in && Array.isArray(filters.flashcard_id_in)) {
                  rows = rows.filter((r) => (filters.flashcard_id_in as string[]).includes(r.flashcard_id))
                }
                return resolve({ data: rows, error: null })
              }
              if (currentTable === 'xp_events') {
                let rows = mockStore.xpEvents.filter((r) => r.user_id === filters.user_id)
                if (filters.source_id_in && Array.isArray(filters.source_id_in)) {
                  rows = rows.filter((r) => (filters.source_id_in as string[]).includes(r.source_id))
                }
                return resolve({ data: rows, error: null })
              }
              return resolve({ data: [], error: null })
            }),
          }
          return qb
        }),
      } as unknown as SupabaseClient<Database>
    })

    it('retrieves review queue data in parallel and correctly calculates due cards', async () => {
      const queue = await getReviewQueueData(mockSupabase, 'usr_t3')

      expect(queue.allUnlockedCards.length).toBe(2)
      // New cards without SRS records are due immediately
      expect(queue.dueCards.length).toBe(2)
      expect(queue.stats.dueTodayCount).toBe(2)
      expect(queue.stats.completedTodayCount).toBe(0)

      const dueCount = await getDueCardsCount(mockSupabase, 'usr_t3')
      expect(dueCount).toBe(2)
    })

    it('recordBatchFlashcardReviews batches multiple reviews in a single operational pass', async () => {
      const reviews = [
        { flashcardId: 'fc-les_091713-1', rating: 4, lessonId: 'les_091713' },
        { flashcardId: 'fc-les_091713-2', rating: 5, lessonId: 'les_091713' },
      ]

      const results = await recordBatchFlashcardReviews(mockSupabase, 'usr_t3', reviews)

      expect(results.length).toBe(2)
      expect(results[0].easeFactor).toBe(2.5) // SM-2 passing rating 4 maintains 2.5 on first repetition
      expect(results[1].easeFactor).toBe(2.6) // SM-2 perfect rating 5 increases ease factor to 2.6

      // Verify both items were persisted into store
      expect(mockStore.srs.length).toBe(2)
      expect(mockStore.srs.find((r) => r.flashcard_id === 'fc-les_091713-1')?.repetitions).toBe(1)
      expect(mockStore.srs.find((r) => r.flashcard_id === 'fc-les_091713-2')?.repetitions).toBe(1)

      // Verify streak update was executed once for the user
      expect(mockStore.updatedStreakUsers).toContain('usr_t3')
    })

    it('preserves exact SM-2 interval calculations without alteration', () => {
      // Test SM-2 state transitions
      const state0 = { repetitions: 0, intervalDays: 0, easeFactor: 2.5 }
      const res1 = calculateSM2(4 as SRSRating, state0)
      expect(res1.repetitions).toBe(1)
      expect(res1.intervalDays).toBe(1)
      expect(res1.easeFactor).toBe(2.5)

      const res2 = calculateSM2(5 as SRSRating, {
        repetitions: res1.repetitions,
        intervalDays: res1.intervalDays,
        easeFactor: res1.easeFactor,
      })
      expect(res2.repetitions).toBe(2)
      expect(res2.intervalDays).toBe(6)
      expect(res2.easeFactor).toBe(2.6)

      // Failing rating resets repetitions to 0 and interval to 1
      const resFail = calculateSM2(1 as SRSRating, {
        repetitions: res2.repetitions,
        intervalDays: res2.intervalDays,
        easeFactor: res2.easeFactor,
      })
      expect(resFail.repetitions).toBe(0)
      expect(resFail.intervalDays).toBe(1)
      expect(resFail.isPassed).toBe(false)
    })
  })
})
