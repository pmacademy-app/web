import { describe, it, expect } from 'vitest'
import type { Database } from '@/types/database'

describe('Database Type Alignment Test Suite (Phase 0)', () => {
  it('types/database.ts contains in_app_broadcasts table definitions', () => {
    type InAppBroadcastRow = Database['public']['Tables']['in_app_broadcasts']['Row']
    type InAppBroadcastInsert = Database['public']['Tables']['in_app_broadcasts']['Insert']
    type InAppBroadcastUpdate = Database['public']['Tables']['in_app_broadcasts']['Update']

    const sampleRow: Partial<InAppBroadcastRow> = {
      id: 'test-id',
      title: 'Test Broadcast',
      body: 'Broadcast message body',
      category: 'announcement',
      status: 'draft',
      audience: 'all',
    }

    const sampleInsert: InAppBroadcastInsert = {
      title: 'Test Broadcast',
      body: 'Broadcast message body',
    }

    const sampleUpdate: InAppBroadcastUpdate = {
      status: 'sending',
    }

    expect(sampleRow.title).toBe('Test Broadcast')
    expect(sampleRow.category).toBe('announcement')
    expect(sampleInsert.title).toBe('Test Broadcast')
    expect(sampleUpdate.status).toBe('sending')
  })

  it('types/database.ts contains email_broadcasts table definitions', () => {
    type EmailBroadcastRow = Database['public']['Tables']['email_broadcasts']['Row']

    const sampleRow: Partial<EmailBroadcastRow> = {
      id: 'test-email-id',
      name: 'Email Broadcast Test',
      template_key: 'marketing',
      status: 'completed',
    }

    expect(sampleRow.name).toBe('Email Broadcast Test')
  })

  it('types/database.ts contains users onboarding_topics and onboarding_preference fields', () => {
    type UserRow = Database['public']['Tables']['users']['Row']
    type UserInsert = Database['public']['Tables']['users']['Insert']
    type UserUpdate = Database['public']['Tables']['users']['Update']

    const sampleUser: Partial<UserRow> = {
      id: 'user-123',
      email: 'test@example.com',
      onboarding_topics: ['strategy', 'discovery'],
      onboarding_preference: 'structured',
    }

    const sampleInsert: Partial<UserInsert> = {
      email: 'test@example.com',
      onboarding_topics: ['strategy'],
    }

    const sampleUpdate: Partial<UserUpdate> = {
      onboarding_preference: 'structured',
    }

    expect(Array.isArray(sampleUser.onboarding_topics)).toBe(true)
    expect(sampleUser.onboarding_topics).toContain('strategy')
    expect(sampleUser.onboarding_preference).toBe('structured')
    expect(sampleInsert.email).toBe('test@example.com')
    expect(sampleUpdate.onboarding_preference).toBe('structured')
  })

  it('types/database.ts contains product_events table definitions (20261024000001)', () => {
    type ProductEventRow = Database['public']['Tables']['product_events']['Row']
    type ProductEventInsert = Database['public']['Tables']['product_events']['Insert']

    const sampleRow: ProductEventRow = {
      id: 'evt-1',
      user_id: null,
      event_name: 'lesson_completed',
      properties: { lessonId: 'les_001', score: 80 },
      occurred_at: '2026-10-24T00:00:00Z',
      created_at: '2026-10-24T00:00:00Z',
    }

    // Only event_name is required on insert; everything else has a DB default or is nullable.
    const sampleInsert: ProductEventInsert = { event_name: 'signup' }

    expect(sampleRow.event_name).toBe('lesson_completed')
    expect(sampleInsert.event_name).toBe('signup')
  })

  it('types/database.ts contains the product_events measurement views (20261024000001)', () => {
    type MasteringRow = Database['public']['Views']['weekly_mastering_learners']['Row']
    type RetentionRow = Database['public']['Views']['weekly_cohort_retention']['Row']

    const mastering: MasteringRow = { week_start: '2026-10-19', mastering_learners: 12 }
    const retention: RetentionRow = {
      cohort_week: '2026-10-12',
      active_week: '2026-10-19',
      week_offset: 1,
      cohort_size: 40,
      active_learners: 9,
    }

    expect(mastering.mastering_learners).toBe(12)
    expect(retention.week_offset).toBe(1)
  })
})
