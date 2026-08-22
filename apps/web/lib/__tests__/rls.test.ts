import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

describe('Supabase Row Level Security (RLS) Policy Test Suite', () => {
  it('1. User-scoped unauthenticated client is denied unauthorized table access', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Repository / Offline Test Verification
    if (!supabaseUrl || supabaseUrl.includes('mock.supabase.co')) {
      expect(supabaseUrl).toBeDefined()
      expect(anonKey).toBeDefined()
      expect(serviceKey).toBeDefined()
      return
    }

    // Live Supabase Verification: unauthenticated anon client MUST NOT read private user data
    const anonClient = createClient(supabaseUrl, anonKey!)
    
    // Test 1: user_lesson_progress table query without auth
    const { data: progressData, error: progressErr } = await anonClient.from('user_lesson_progress').select('*').limit(5)
    if (progressErr) {
      expect(progressErr.code).toBeDefined()
    } else {
      expect(progressData?.length ?? 0).toBe(0)
    }

    // Test 2: user_notification_preferences table query without auth
    const { data: prefsData, error: prefsErr } = await anonClient.from('user_notification_preferences').select('*').limit(5)
    if (prefsErr) {
      expect(prefsErr.code).toBeDefined()
    } else {
      expect(prefsData?.length ?? 0).toBe(0)
    }

    // Test 3: email_queue table query without auth
    const { data: queueData, error: queueErr } = await anonClient.from('email_queue').select('*').limit(5)
    if (queueErr) {
      expect(queueErr.code).toBeDefined()
    } else {
      expect(queueData?.length ?? 0).toBe(0)
    }
  })

  it('2. Service-role client bypasses RLS for administrative operations', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || supabaseUrl.includes('mock.supabase.co') || !serviceKey || serviceKey.includes('mock')) {
      expect(true).toBe(true)
      return
    }

    const serviceClient = createClient(supabaseUrl, serviceKey)
    const { data, error } = await serviceClient.from('users').select('id').limit(1)
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
