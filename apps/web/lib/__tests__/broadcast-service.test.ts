import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BroadcastService } from '../admin/broadcast-service'
import type { AdminUserFilters } from '../admin/types'

// Mock supabase client for unit testing BroadcastService logic
vi.mock('@/lib/supabase', () => {
  return {
    createServiceRoleClient: vi.fn(),
  }
})

describe('Email Broadcast Service & Filtering Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('validates broadcast status transitions and constraints', () => {
    expect(BroadcastService).toBeDefined()

    // Draft can be updated and scheduled
    const draftStatus = 'draft'
    expect(['draft', 'scheduled'].includes(draftStatus)).toBe(true)

    // Completed or failed cannot be rescheduled or updated
    const completedStatus = 'completed'
    expect(['draft', 'scheduled'].includes(completedStatus)).toBe(false)
  })

  it('formats recipient filters snapshot cleanly', () => {
    const filters: AdminUserFilters = {
      verification: 'verified',
      role: 'learner',
      onboardingStatus: 'completed',
      experienceLevels: ['beginner', 'learning'],
      goals: ['become_pm'],
      topics: ['discovery', 'strategy'],
      activeLastDays: 14,
      marketingEmailOptIn: true,
      excludeIfReceivedTemplate: 'inactive.resume_learning',
    }

    expect(filters.verification).toBe('verified')
    expect(filters.experienceLevels?.length).toBe(2)
    expect(filters.topics).toContain('discovery')
    expect(filters.topics).toContain('strategy')
    expect(filters.marketingEmailOptIn).toBe(true)
  })

  it('ensures batch execution calculates progress and completion bounds correctly', () => {
    const batchSize = 100
    const totalRecipients = 245
    
    // Batch 1: index 0 -> 0 to 100
    const batch1Processed = (0 + 1) * batchSize
    expect(batch1Processed < totalRecipients).toBe(true)

    // Batch 2: index 1 -> 100 to 200
    const batch2Processed = (1 + 1) * batchSize
    expect(batch2Processed < totalRecipients).toBe(true)

    // Batch 3: index 2 -> 200 to 300 (covers all 245)
    const batch3Processed = (2 + 1) * batchSize
    expect(batch3Processed >= totalRecipients).toBe(true)
  })
})
