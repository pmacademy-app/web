/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state
let mockTestimonials: any[] = []
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
    range: vi.fn(() => chain),
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

describe('Phase 2: published testimonials data mapping integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastSelectedUsersColumns = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key'
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

      const { TestimonialsService } = await import('@/lib/feedback/published-testimonials')
      const published = await TestimonialsService.getPublishedTestimonials()

      expect(lastSelectedUsersColumns).toBe('id, name, username, email')
      expect(lastSelectedUsersColumns).not.toContain('full_name')

      expect(published).toHaveLength(2)
      expect(published[0].authorName).toBe('Sarah Connor')
      expect(published[0].role).toBe('Senior PM')
      expect(published[1].authorName).toBe('techlead_pm')
      expect(published[1].role).toBe('Prodily Learner')
      expect(published[1].role).not.toContain('PM Academy')
      expect(published[1].role).not.toContain('Verified')
    })
  })
})
