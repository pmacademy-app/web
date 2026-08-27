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
})
