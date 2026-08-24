/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state
let mockTestimonials: any[] = []
let mockFeedback: any[] = []
let mockUsers: any[] = []
let lastSelectedUsersColumns: string | null = null

const createChain = (table: string) => {
  const chain: any = {
    select: vi.fn((cols: string) => {
      if (table === 'users') {
        lastSelectedUsersColumns = cols
      }
      return chain
    }),
    eq: vi.fn(() => chain),
    in: vi.fn((field: string, vals: any[]) => {
      if (table === 'users' && field === 'id') {
        chain._userIds = vals
      }
      return chain
    }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    insert: vi.fn((payload: any) => {
      chain._insertPayload = payload
      return chain
    }),
    update: vi.fn((payload: any) => {
      chain._updatePayload = payload
      return chain
    }),
    single: vi.fn(() => Promise.resolve({ data: chain._insertPayload || null, error: null })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: (resolve: any) => {
      if (table === 'testimonials') {
        resolve({ data: mockTestimonials, error: null })
      } else if (table === 'user_feedback') {
        resolve({ data: mockFeedback, error: null })
      } else if (table === 'users') {
        const filtered = chain._userIds
          ? mockUsers.filter((u) => chain._userIds.includes(u.id))
          : mockUsers
        resolve({ data: filtered, error: null })
      } else {
        resolve({ data: [], error: null })
      }
    },
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => createChain(table)),
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn: any) => fn),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/admin/guard', () => ({
  requireAdminUser: vi.fn(async () => ({
    authorized: true,
    userId: 'admin-1',
    email: 'admin@prodily.app',
  })),
  logAdminAction: vi.fn(async () => {}),
}))

describe('Phase 2 — Feedback & Moderation Data Mapping Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastSelectedUsersColumns = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
  })

  describe('getModerationQueue()', () => {
    it('queries users.name (NOT users.full_name) and attributes names correctly with fallbacks', async () => {
      mockTestimonials = [
        {
          id: 'test-1',
          user_id: 'usr-complete',
          content: 'Great course!',
          status: 'pending',
          is_published: false,
          source_event: 'module_completion',
          created_at: '2026-08-23T10:00:00Z',
        },
        {
          id: 'test-2',
          user_id: 'usr-username-only',
          content: 'Loved the quizzes.',
          status: 'pending',
          is_published: false,
          source_event: 'general',
          created_at: '2026-08-23T11:00:00Z',
        },
        {
          id: 'test-3',
          user_id: 'usr-email-only',
          content: 'Clear explanations.',
          status: 'pending',
          is_published: false,
          source_event: 'general',
          created_at: '2026-08-23T12:00:00Z',
        },
        {
          id: 'test-4',
          user_id: 'usr-deleted',
          content: 'Good material.',
          status: 'pending',
          is_published: false,
          source_event: 'general',
          created_at: '2026-08-23T13:00:00Z',
        },
        {
          id: 'test-5',
          user_id: null,
          content: 'Anonymous praise.',
          status: 'pending',
          is_published: false,
          source_event: 'general',
          created_at: '2026-08-23T14:00:00Z',
        },
      ]

      mockUsers = [
        {
          id: 'usr-complete',
          name: 'Jane Doe',
          username: 'janedoe',
          email: 'jane@example.com',
        },
        {
          id: 'usr-username-only',
          name: null,
          username: 'superpm',
          email: 'superpm@example.com',
        },
        {
          id: 'usr-email-only',
          name: null,
          username: null,
          email: 'alex.smith@example.com',
        },
      ]

      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')
      const queue = await FeedbackAdminService.getModerationQueue()

      // Verify that query selects 'id, name, username, email' and NEVER 'full_name'
      expect(lastSelectedUsersColumns).toBe('id, name, username, email')
      expect(lastSelectedUsersColumns).not.toContain('full_name')

      expect(queue).toHaveLength(5)

      // 1. User with full name -> 'Jane Doe'
      const item1 = queue.find((q) => q.id === 'test-1')
      expect(item1?.authorName).toBe('Jane Doe')

      // 2. User without name -> username 'superpm'
      const item2 = queue.find((q) => q.id === 'test-2')
      expect(item2?.authorName).toBe('superpm')

      // 3. User without name or username -> email prefix 'alex.smith'
      const item3 = queue.find((q) => q.id === 'test-3')
      expect(item3?.authorName).toBe('alex.smith')

      // 4. Deleted user (user_id exists, no user row) -> 'Deleted Learner'
      const item4 = queue.find((q) => q.id === 'test-4')
      expect(item4?.authorName).toBe('Deleted Learner')

      // 5. Anonymous feedback (user_id is null) -> 'PM Academy Learner'
      const item5 = queue.find((q) => q.id === 'test-5')
      expect(item5?.authorName).toBe('PM Academy Learner')
    })
  })

  describe('getPublishedTestimonials()', () => {
    it('queries users.name without full_name and resolves public testimonials properly', async () => {
      mockTestimonials = [
        {
          id: 'pub-1',
          user_id: 'usr-complete',
          author_name: null,
          author_role: 'Senior PM',
          content: 'Helped me transition to product.',
          is_published: true,
          status: 'approved',
          created_at: '2026-08-20T00:00:00Z',
        },
        {
          id: 'pub-2',
          user_id: 'usr-username-only',
          author_name: null,
          author_role: null,
          content: 'Top quality framework breakdowns.',
          is_published: true,
          status: 'approved',
          created_at: '2026-08-21T00:00:00Z',
        },
      ]

      mockUsers = [
        {
          id: 'usr-complete',
          name: 'Sarah Connor',
          username: 'sconnor',
          email: 'sarah@example.com',
        },
        {
          id: 'usr-username-only',
          name: null,
          username: 'techlead_pm',
          email: 'tech@example.com',
        },
      ]

      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')
      const published = await FeedbackAdminService.getPublishedTestimonials()

      expect(lastSelectedUsersColumns).toBe('id, name, username, email')
      expect(lastSelectedUsersColumns).not.toContain('full_name')

      expect(published).toHaveLength(2)
      expect(published[0].authorName).toBe('Sarah Connor')
      expect(published[0].role).toBe('Senior PM')
      expect(published[1].authorName).toBe('techlead_pm')
      expect(published[1].role).toBe('Verified PM Academy Learner')
    })
  })

  describe('getPrivateFeedbackList()', () => {
    it('correctly maps anonymous feedback vs deleted learner vs active learner with valid name', async () => {
      mockFeedback = [
        {
          id: 'fb-1',
          user_id: 'usr-active',
          category: 'curriculum',
          source_event: 'lesson_quiz',
          content: 'The quiz on lesson 3 was tricky but fair.',
          rating: 5,
          status: 'new',
          created_at: '2026-08-22T08:00:00Z',
        },
        {
          id: 'fb-2',
          user_id: 'usr-ghost',
          category: 'ui',
          source_event: 'navigation',
          content: 'Sidebar feels sluggish on mobile.',
          rating: 3,
          status: 'reviewed',
          created_at: '2026-08-22T09:00:00Z',
        },
        {
          id: 'fb-3',
          user_id: null,
          category: 'general',
          source_event: 'landing_page',
          content: 'Add more system design case studies!',
          rating: 4,
          status: 'new',
          created_at: '2026-08-22T10:00:00Z',
        },
      ]

      mockUsers = [
        {
          id: 'usr-active',
          name: 'Michael Scott',
          username: 'mscott',
          email: 'michael@dundermifflin.com',
        },
      ]

      const { FeedbackAdminService } = await import('@/lib/admin/feedback-service')
      const feedbackList = await FeedbackAdminService.getPrivateFeedbackList()

      expect(lastSelectedUsersColumns).toBe('id, name, username, email')
      expect(lastSelectedUsersColumns).not.toContain('full_name')

      expect(feedbackList).toHaveLength(3)

      // 1. Active user with name
      const active = feedbackList.find((f) => f.id === 'fb-1')
      expect(active?.authorName).toBe('Michael Scott')
      expect(active?.authorEmail).toBe('michael@dundermifflin.com')
      expect(active?.userExists).toBe(true)

      // 2. Deleted user (user_id exists, not in users table)
      const ghost = feedbackList.find((f) => f.id === 'fb-2')
      expect(ghost?.authorName).toBe('Deleted Learner')
      expect(ghost?.authorEmail).toBeNull()
      expect(ghost?.userExists).toBe(false)

      // 3. Anonymous user (user_id is null)
      const anon = feedbackList.find((f) => f.id === 'fb-3')
      expect(anon?.authorName).toBe('Anonymous Learner')
      expect(anon?.authorEmail).toBeNull()
      expect(anon?.userExists).toBe(false)
    })
  })
})
