import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getReviewQueueData,
  recordFlashcardReview,
} from '../flashcards-service'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../supabase'

// Mock lesson loader to provide realistic compiled curriculum data
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

describe('Flashcard Completion & Review Persistence Test Suite', () => {
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
  }

  let mockSupabase: SupabaseClient<Database>

  beforeEach(() => {
    mockStore = {
      lessonProgress: [],
      srs: [],
      xpEvents: [],
    }

    mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        const currentFilterTable = table
        const filters: Record<string, unknown> = {}

        const queryBuilder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((field: string, val: unknown) => {
            filters[field] = val
            return queryBuilder
          }),
          single: vi.fn().mockImplementation(async () => {
            if (currentFilterTable === 'users') {
              return { data: { timezone: 'UTC' }, error: null }
            }
            return { data: null, error: null }
          }),
          maybeSingle: vi.fn().mockImplementation(async () => {
            if (currentFilterTable === 'user_flashcard_srs') {
              const row = mockStore.srs.find(
                (r) => r.user_id === filters.user_id && r.flashcard_id === filters.flashcard_id
              )
              return { data: row || null, error: null }
            }
            return { data: null, error: null }
          }),
          upsert: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
            if (currentFilterTable === 'user_flashcard_srs') {
              const rowPayload = payload as (typeof mockStore.srs)[number]
              const existingIndex = mockStore.srs.findIndex(
                (r) => r.user_id === rowPayload.user_id && r.flashcard_id === rowPayload.flashcard_id
              )
              if (existingIndex >= 0) {
                mockStore.srs[existingIndex] = { ...mockStore.srs[existingIndex], ...rowPayload }
              } else {
                mockStore.srs.push(rowPayload)
              }
              return { data: payload, error: null }
            }
            return { data: payload, error: null }
          }),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
          insert: vi.fn().mockImplementation(async (payload: Record<string, unknown>) => {
            if (currentFilterTable === 'xp_events') {
              const item = payload as Partial<(typeof mockStore.xpEvents)[number]>
              mockStore.xpEvents.push({
                user_id: String(item.user_id || ''),
                source_type: String(item.source_type || ''),
                source_id: String(item.source_id || ''),
                created_at: String(item.created_at || new Date().toISOString()),
              })
            }
            return { data: payload, error: null }
          }),
          then: vi.fn().mockImplementation((resolve: (val: unknown) => void) => {
            if (currentFilterTable === 'user_lesson_progress') {
              let rows = mockStore.lessonProgress.filter((r) => r.user_id === filters.user_id)
              if (filters.status) {
                rows = rows.filter((r) => r.status === filters.status)
              }
              return resolve({ data: rows, error: null })
            }
            if (currentFilterTable === 'user_flashcard_srs') {
              const rows = mockStore.srs.filter((r) => r.user_id === filters.user_id)
              return resolve({ data: rows, error: null })
            }
            if (currentFilterTable === 'xp_events') {
              let rows = mockStore.xpEvents.filter((r) => r.user_id === filters.user_id)
              if (filters.source_type) {
                rows = rows.filter((r) => r.source_type === filters.source_type)
              }
              return resolve({ data: rows, error: null })
            }
            return resolve({ data: [], error: null })
          }),
        }

        return queryBuilder
      }),
    } as unknown as SupabaseClient<Database>
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Persistence & Composite PK Handling
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Review Persistence & SM-2 State Updates', () => {
    it('persists flashcard review with lesson_id, ease_factor, and future next_review_at', async () => {
      const result = await recordFlashcardReview(
        mockSupabase,
        'usr_1',
        'fc-les_091713-1',
        4, // Passing recall
        'les_091713'
      )

      expect(result.easeFactor).toBe(2.5)
      expect(result.nextReviewAt).toBeInstanceOf(Date)
      expect(result.nextReviewAt.getTime()).toBeGreaterThan(Date.now())

      // Verify row in database store
      const storedRow = mockStore.srs.find(
        (r) => r.user_id === 'usr_1' && r.flashcard_id === 'fc-les_091713-1'
      )
      expect(storedRow).toBeDefined()
      expect(storedRow?.lesson_id).toBe('les_091713')
      expect(storedRow?.repetitions).toBe(1)
      expect(storedRow?.interval_days).toBe(1)
    })

    it('infers lesson_id from flashcard ID prefix if explicitLessonId is not supplied', async () => {
      await recordFlashcardReview(
        mockSupabase,
        'usr_1',
        'fc-les_4kpbq6-1',
        5 // Perfect recall
      )

      const storedRow = mockStore.srs.find(
        (r) => r.user_id === 'usr_1' && r.flashcard_id === 'fc-les_4kpbq6-1'
      )
      expect(storedRow).toBeDefined()
      expect(storedRow?.lesson_id).toBe('les_4kpbq6')
      expect(storedRow?.ease_factor).toBe(2.6)
    })

    it('updates existing SM-2 state on subsequent review ratings', async () => {
      // First review
      await recordFlashcardReview(mockSupabase, 'usr_1', 'fc-les_091713-1', 4, 'les_091713')
      // Second review
      await recordFlashcardReview(mockSupabase, 'usr_1', 'fc-les_091713-1', 5, 'les_091713')

      const storedRow = mockStore.srs.find(
        (r) => r.user_id === 'usr_1' && r.flashcard_id === 'fc-les_091713-1'
      )
      expect(storedRow?.repetitions).toBe(2)
      expect(storedRow?.interval_days).toBe(6)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Queue Retrieval & Unlocked Lesson Scope
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Review Queue Retrieval & Unlock Scope', () => {
    it('unlocks cards for lessons with status in_progress as well as completed', async () => {
      mockStore.lessonProgress = [
        { user_id: 'usr_1', lesson_id: 'les_091713', status: 'in_progress' },
      ]

      const queue = await getReviewQueueData(mockSupabase, 'usr_1')
      expect(queue.allUnlockedCards.length).toBe(2)
      expect(queue.dueCards.length).toBe(2) // Both new, so due immediately
      expect(queue.stats.dueTodayCount).toBe(2)
      expect(queue.stats.totalUnlockedCount).toBe(2)
    })

    it('retains cards in unlocked set if user has an existing SRS record even before lesson completion', async () => {
      // User reviewed card fc-les_4kpbq6-1 but has no lesson progress record yet
      mockStore.srs = [
        {
          user_id: 'usr_1',
          lesson_id: 'les_4kpbq6',
          flashcard_id: 'fc-les_4kpbq6-1',
          ease_factor: 2.5,
          interval_days: 1,
          repetitions: 1,
          next_review_at: new Date(Date.now() + 86400000).toISOString(),
        },
      ]

      const queue = await getReviewQueueData(mockSupabase, 'usr_1')
      expect(queue.allUnlockedCards.length).toBeGreaterThan(0)
      expect(queue.allUnlockedCards.some((c) => c.id === 'fc-les_4kpbq6-1')).toBe(true)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Refresh & Revisit Persistence (No Lost Progress)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Revisit & Refresh Progress Retention', () => {
    it('excludes completed cards from due queue upon browser refresh / re-fetch', async () => {
      // User is studying lesson les_091713 (2 flashcards: fc-les_091713-1 and fc-les_091713-2)
      mockStore.lessonProgress = [
        { user_id: 'usr_1', lesson_id: 'les_091713', status: 'completed' },
      ]

      // Initial state: 2 cards due
      let queue = await getReviewQueueData(mockSupabase, 'usr_1')
      expect(queue.dueCards.length).toBe(2)

      // User reviews card 1 with rating 4
      await recordFlashcardReview(mockSupabase, 'usr_1', 'fc-les_091713-1', 4, 'les_091713')

      // Simulate Page Refresh: getReviewQueueData called fresh
      queue = await getReviewQueueData(mockSupabase, 'usr_1')

      // Card 1 is scheduled for tomorrow, so only Card 2 is due now!
      expect(queue.dueCards.length).toBe(1)
      expect(queue.dueCards[0].id).toBe('fc-les_091713-2')
      expect(queue.stats.dueTodayCount).toBe(1)
      expect(queue.stats.upcomingCount).toBe(1)

      // User reviews card 2 with rating 5
      await recordFlashcardReview(mockSupabase, 'usr_1', 'fc-les_091713-2', 5, 'les_091713')

      // Simulate Re-navigating to Review Hub
      queue = await getReviewQueueData(mockSupabase, 'usr_1')
      expect(queue.dueCards.length).toBe(0) // All caught up!
      expect(queue.stats.dueTodayCount).toBe(0)
      expect(queue.stats.upcomingCount).toBe(2)
    })
  })
})
